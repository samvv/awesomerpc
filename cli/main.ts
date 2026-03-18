#!/usr/bin/env bun

import { command, option, optional, positional, rest, run, string, subcommands } from "cmd-ts"
import { anyContract, emptyContract, implement, connect, WebSocketTransport, TransportError } from "awesomerpc";
import pino from "pino";

const logger = pino({
  level: process.env.AWESOMERPC_LOG_LEVEL || 'info',
}, process.stderr);

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
          defaultValue: () => 'ws://localhost:3000/ws',
          defaultValueIsSerializable: true,
        }),
        methodName: positional({
          displayName: 'method-name',
          type: string,
        }),
        args: rest(),
      },
      handler: handled(async args => {
        // Extract arguments
        const url = args.url;
        const methodName = args.methodName;
        const methodArgs = args.args.map(parse);

        // Initialize RPC
        console.info(`> Sending request to ${url} ...`);
        const transport = await loadTransport(url);
        await transport.open();
        const local = emptyContract(); // Remote is not allowed to call any methods
        const remote = anyContract(); // We are allowed to dynamically call anthing we wish
        const rpc = connect(implement(local, remote).finish(), transport, {}, logger);

        const result = await rpc.callMethod(methodName, methodArgs)
        await print(result);

        rpc.close();
        transport.close();
      }),
    }),
    notify: command({
      name: 'notify',
      args: {
        url: option({
          long: 'url',
          description: 'The URL to connect to',
          type: string,
          defaultValue: () => 'ws://localhost:3000/ws',
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
      handler: handled(async args => {
        // Extract arguments
        const url = args.url;
        const eventName = args.eventName;
        const arg = args.arg ? parse(args.arg) : args.arg;

        // Initialize RPC
        const transport = await loadTransport(url);
        await transport.open();
        const local = emptyContract(); // Remote is not allowed to call any methods
        const remote = anyContract(); // We are allowed to dynamically call anthing we wish
        const rpc = connect(implement(local, remote).finish(), transport, {});

        await rpc.notify(eventName, arg);

        rpc.close();
        transport.close();
      }),
    }),
  }
});

type Promisify<T extends (...args: any) => any> = (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>;

function handled<Fn extends (...args: any[]) => any>(proc: Fn): Promisify<Fn> {
  return (async (...args) => {
    try {
      return await proc(...args);
    } catch (error) {
      if (error instanceof TransportError) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      throw error;
    }
  }) as Fn;
}

async function loadTransport(url: string) {
  const protocol = new URL(url).protocol;
  switch (protocol) {
    case 'ws:':
      return new WebSocketTransport(url);
    default:
      throw new Error(`Unrecognised protocol '${protocol}'`);
  }
}

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
