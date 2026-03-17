import { test, expect } from "bun:test"
import t from "reflect-types";

import { contract, implement } from "./types.js"
import { createDuplex } from "./transport.js"
import { connect } from "./rpc.js"
import { FailedValidationError } from "./error.js";

const leftContract = contract({
  methods: {
    getState: t.callable([] as const, t.number()),
    setState: t.callable([ t.number() ] as const, t.undefined()),
    returnInvalid: t.callable([] as const, t.number()),
  },
  events: {
    someevent: t.string(),
  }
});

const rightContract = contract({
  methods: {
    getState: t.callable([] as const, t.number()),
    setState: t.callable([ t.number() ] as const, t.undefined()),
    getLength: t.callable([ t.string() ] as const, t.number()),
  }
});

const leftImpl = implement(leftContract, rightContract)
  .state<{ foo: number; }>()
  // .methods(stateHandlers())
  .methods({
    getState({ state: { foo } }) {
      return foo;
    },
    setState({ state, args: [ newFoo ] }) {
      state.foo = newFoo;
    },
  })
  .methods({
    // @ts-expect-error Wrong function return type on purpose
    returnInvalid() {
      return "a string";
    }
  })
  .finish();

const rightImpl = implement(rightContract, leftContract)
  .state<{ foo: number; }>()
  .methods({
    getState({ state }) {
      return state.foo;
    },
    setState({ state,  args: [ newState ]}) {
      state.foo = newState;
    },
    getLength({ args: [ s ] }) {
      return s.length;
    }
  })
  .finish();


test('can call methods on both sides', async () => {

  const [leftTransport, rightTransport] = createDuplex();
  const left = connect(leftImpl, leftTransport, { foo: 42 });
  const right = connect(rightImpl, rightTransport, { foo: 33 });

  expect(await left.callMethod('getLength', ["foobar"])).toStrictEqual(6);
  expect(await left.callMethod('getState', [])).toStrictEqual(33);
  expect(await right.callMethod('getState', [])).toStrictEqual(42);

  left.close();
  right.close();

});

test('throws an error on invalid param count', async () => {
  const [leftTransport, rightTransport] = createDuplex();
  const left = connect(leftImpl, leftTransport, { foo: 42 });
  const right = connect(rightImpl, rightTransport, { foo: 33 });

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
  const left = connect(leftImpl, leftTransport, { foo: 42 });
  const right = connect(rightImpl, rightTransport, { foo: 33 });

  expect(right.callMethod('returnInvalid', [])).rejects.toBeInstanceOf(FailedValidationError);
});

test('can send events', done => {
  const [leftTransport, rightTransport] = createDuplex();
  const left = connect(leftImpl, leftTransport, { foo: 42 });
  const right = connect(rightImpl, rightTransport, { foo: 33 });

  left.getEvent('someevent').subscribe(msg => {
    expect(msg).toStrictEqual('foo');
    done();
  });

  right.notify('someevent', 'foo');

});
