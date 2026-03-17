import { WebSocketTransport, RPC } from "awesomerpc";
import { clientImpl } from "./client.js";
import { serverContract } from "./contracts.js";

const transport = new WebSocketTransport(`http://localhost:8080/ws`);
transport.open();

const rpc = new RPC(transport, clientImpl, serverContract, {});

console.log(`Available products: ${await rpc.callMethod('getProducts', [])}`);
