# AwesomeRPC

AwesomeRPC is an easy-to-use RPC framework written in TypeScript. It features
advanced reflection capabilities, allowing you to define type-safe APIs in nothing
more than a bit of TypeScript. No copy-pasting or code generators needed!

## Quick Start

First, you need to define a _contract_ for your API. A contract is kind of like
a TypeScript interface: it defines what methods (and events) are allowed.

```ts
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

const petStoreClientImpl = implement(petStoreClientContract)
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

