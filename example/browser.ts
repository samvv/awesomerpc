import { WebSocketTransport, RPC } from "awesomerpc";
import { clientImpl } from "./impl/client.js";

const transport = new WebSocketTransport(`http://localhost:8080/ws`);
transport.open();

const rpc = new RPC(transport, clientImpl, {});

console.log(`Available products in basket: ${await rpc.callMethod('getBasket', [])}`);
