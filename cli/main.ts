#!/usr/bin/env bun

import { command, number, option, optional, positional, rest, run, string, subcommands } from "cmd-ts"
import { anyContract, emptyContract, implement, connect, WebSocketTransport } from "awesomerpc";
import { which } from "bun";

const cli = subcommands({
  name: 'awesomerpc',
  cmds: {
    call: command({
      name: 'call',
      args: {
        url: option({
          long: 'url',
          description: 'The URL to connect to',
          type: string,
          defaultValue: () => 'http://localhost:3000/ws',
          defaultValueIsSerializable: true,
        }),
        methodName: positional({
          displayName: 'method-name',
          type: string,
        }),
        args: rest(),
      },
      handler: async args => {
        // Extract arguments
        const url = args.url;
        const methodName = args.methodName;
        const methodArgs = args.args.map(parse);

        // Initialize RPC
        console.info(`> Sending request to ${url} ...`);
        const ws = new WebSocketTransport(url);
        await ws.open();
        const local = emptyContract(); // Remote is not allowed to call any methods
        const remote = anyContract(); // We are allowed to dynamically call anthing we wish
        const rpc = connect(implement(local, remote).finish(), ws, {});

        await print(await rpc.callMethod(methodName, methodArgs));

        rpc.close();
        ws.close();
      }
    }),
    notify: command({
      name: 'notify',
      args: {
        url: option({
          long: 'url',
          description: 'The URL to connect to',
          type: string,
          defaultValue: () => 'http://localhost:3000/ws',
          defaultValueIsSerializable: true,
        }),
        eventName: positional({
          displayName: 'event-name',
          type: string,
        }),
        arg: positional({
          type: optional(string),
        }),
      },
      handler: async args => {
        // Extract arguments
        const url = args.url;
        const eventName = args.eventName;
        const arg = args.arg ? parse(args.arg) : args.arg;

        // Initialize RPC

        const ws = new WebSocketTransport(url);
        await ws.open();
        const local = emptyContract(); // Remote is not allowed to call any methods
        const remote = anyContract(); // We are allowed to dynamically call anthing we wish
        const rpc = connect(implement(local, remote).finish(), ws, {});

        await rpc.notify(eventName, arg);

        rpc.close();
        ws.close();
      },
    }),
  }
});

await run(cli, process.argv.slice(2));

async function print(value: any): Promise<void> {
  if (isPrimitive(value)) {
    console.log(value)
  } else if (value[Symbol.asyncIterator] !== undefined) {
    const iter = value[Symbol.asyncIterator]();
    for (;;) {
      const { done, value } = await iter.next();
      if (done) {
        if (value !== undefined) {
          console.log('---')
          console.log(value);
        }
        break
      }
      console.log(value);
    }
  } else if (typeof(value.then) === 'function') {
    await print(await value);
  } else {
    console.log(value)
  }
}

function isPrimitive(value: any): boolean {
  return value === null
      || typeof(value) === 'string'
      || typeof(value) === 'number'
      || typeof(value) === 'bigint'
      || typeof(value) === 'boolean'
      || Array.isArray(value)
}

function parse(text: string): any {
  if (text === 'true') {
    return true;
  }
  if (text === 'false') {
    return false;
  }
  const number = Number(text);
  if (!Number.isNaN(number)) {
    return number;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}
