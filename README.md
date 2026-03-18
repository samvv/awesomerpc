# AwesomeRPC

AwesomeRPC is an easy-to-use RPC framework written in TypeScript. It features
advanced reflection capabilities, allowing you to define type-safe APIs in nothing
more than a bit of TypeScript. No copy-pasting or code generators needed!

## Quick Start

First, you need to define a _contract_ for your API. A contract is kind of like
a TypeScript interface: it defines what methods (and events) are allowed.

```ts
import t from "reflect-types";
import { contract } from "awesomerpc";

// A client API that connects to the server in the browser via web sockets
const petStoreClientContract = contract({
    // These methods the server can call on the client at any time
    methods: {
        refresh: t.callable([] as const, t.void()),
    },
    // These events may be received by the client, coming from the server
    events: {
        logout: t.undefined(),
    },
});
```

Next, you need to implement this contract, like so:

```ts
import { implement } from "awesomerpc";

const petStoreClientImpl = implement(petStoreClientContract, petStoreServerContract)
    .method('refresh', (_ctx) => {
        window.location.reload();
    })
    .finish();
```

Finally, you can connect to the server using, for example, the browser's web socket:

```ts
import { WebSocketTransport, RPC } from "awesomerpc";

const transport = new WebSocketTransport(`http://localhost:8080/ws`);
transport.open(); // will open the socket in the background

const rpc = new RPC(
    transport,
    petStoreClientImpl, // local API
    petStoreServerContract, // remote API
    {} // local state
);

console.log(`Available products: ${await rpc.callMethod('getProducts', [])}`);
```

For more information, read the full example in the `example/` directory.

## API

### Transports

#### `new WebSocketTransport(url)`

Create a new transport that uses WebSocket to send and receive messages.

### `Transport.open()`

Connect to whatever was specified as the destination address during the
construction of the transport.

This method returns a promise object that may be awaited in order to ensure the
connection is ready for use.

### Top-level Functions

#### `connect(impl, state, logger?)`

```ts
import pino from "pino";

import { connect } from "awesomerpc";

connect(petStoreClientImpl, {});
```

## FAQ

### How do I enable logging?

To enable logging, you need to create and object that satisfies the `Logger`
interface. [Pino][pino] is one such logger that is compatible with this
interface. You can install it using:

```sh
$ npm install pino
```

Next, you need to define the logger object. In this example, the log level is
read from the environment variable `MYAPP_LOG_LEVEL` and defaults to `info`.

**src/logging.ts**
```ts
import pino from "pino";

export const logger = pino({
  level: process.env.MYAPP_LOG_LEVEL || 'info',
});
```

Pass this object in while creating a connection, like so:

```ts
import { connect } from "awesomerpc";

import { logger } from "./logging";

connect(petStoreClientImpl, {}, logger);
```

If no logger is specified, AwesomeRPC will simply not log anything.

## License

This project is licensed under the MIT license. See `LICENSE.txt` for more information.
