import { test, expect } from "bun:test"
import { types as t } from "reflect-types";

import { contract, implement } from "./types.js"
import { createDuplex } from "./transport.js"
import { connect } from "./rpc.js"
import { FailedValidationError } from "./error.js";

const local = contract({
  methods: {
    getState: t.callable([] as const, t.number()),
    setState: t.callable([ t.number() ] as const, t.undefined()),
    returnInvalid: t.callable([] as const, t.number()),
  },
  events: {
    someevent: t.string(),
  }
});

const remote = contract({
  methods: {
    getState: t.callable([] as const, t.number()),
    setState: t.callable([ t.number() ] as const, t.undefined()),
    getLength: t.callable([ t.string() ] as const, t.number()),
  }
});

const leftImpl = implement(local)
  .state<{ foo: number }>()
  .methods({
    getState(ctx) {
      return ctx.foo;
    },
    setState(ctx, state) {
      ctx.foo = state;
    },
    // @ts-expect-error Wrong function return type on purpose
    returnInvalid() {
      return "a string";
    }
  })
  .finish();

const rightImpl = implement(remote)
  .state<{ foo: number }>()
  .methods({
    getState(ctx) {
      return ctx.foo;
    },
    setState(ctx, state) {
      ctx.foo = state;
    },
    getLength(_ctx, s) {
      return s.length;
    }
  })
  .finish();


test('can call methods on both sides', async () => {

  const [leftTransport, rightTransport] = createDuplex();
  const left = connect(leftImpl, remote, leftTransport, { foo: 42 });
  const right = connect(rightImpl, local, rightTransport, { foo: 33 });

  expect(await left.callMethod('getLength', ["foobar"])).toStrictEqual(6);
  expect(await left.callMethod('getState', [])).toStrictEqual(33);
  expect(await right.callMethod('getState', [])).toStrictEqual(42);

  left.close();
  right.close();

});

test('throws an error on invalid param count', async () => {
  const [leftTransport, rightTransport] = createDuplex();
  const left = connect(leftImpl, remote, leftTransport, { foo: 42 });
  const right = connect(rightImpl, local, rightTransport, { foo: 33 });

  expect(left.callMethod('getLength',
    // @ts-expect-error Deliberatly added a param
    [ "foo", "bar" ]
  )).rejects.toBeInstanceOf(Error); // TODO be more specific
  expect(left.callMethod('getLength',
    // @ts-expect-error Deliberatly removed a param
    [ ]
  )).rejects.toBeInstanceOf(Error); // TODO be more specific
});

test('throws an error on invalid return', async () => {
  const [leftTransport, rightTransport] = createDuplex();
  const left = connect(leftImpl, remote, leftTransport, { foo: 42 });
  const right = connect(rightImpl, local, rightTransport, { foo: 33 });

  expect(right.callMethod('returnInvalid', [])).rejects.toBeInstanceOf(FailedValidationError);
});

test('can send events', done => {
  const [leftTransport, rightTransport] = createDuplex();
  const left = connect(leftImpl, remote, leftTransport, { foo: 42 });
  const right = connect(rightImpl, local, rightTransport, { foo: 33 });

  left.getEvent('someevent').subscribe(msg => {
    expect(msg).toStrictEqual('foo');
    done();
  });

  right.notify('someevent', 'foo');

});
