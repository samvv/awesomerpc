import { upgradeWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import type { Context } from "hono";

import { RPC } from "../rpc.js"
import { RawTransport } from "../transport.js";
import type { Impl } from "../types.js";
import { anyContract } from "../types.js";

const KEY_WEBSOCKET_DATA = 'awesomerpc'

export default function honoServe<I extends Impl>(impl: I, createState: (ctx: Context, ws: WSContext) => I['state']) {

  interface SessionData {
    rpc: RPC<I>;
    transport: RawTransport;
  }

  function getData(ws: WSContext): SessionData {
    return (ws.raw as Bun.ServerWebSocket<any>).data[KEY_WEBSOCKET_DATA] as SessionData;
  }

  return upgradeWebSocket(ctx => {
    return {
      onOpen(_evt, ws) {
        const state = createState(ctx, ws);
        const sws = ws.raw as Bun.ServerWebSocket<any>;
        const transport = new RawTransport(
          data => ws.send(data)
        );
        const rpc = new RPC(
          transport,
          impl,
          state,
        );
        sws.data[KEY_WEBSOCKET_DATA] = { rpc, transport };
      },
      onMessage(evt, ws) {
        getData(ws).transport.feed(evt.data.toString());
      },
      onClose(_evt, ws) {
        const data = getData(ws);
        data.rpc.close();
        data.transport.close();
      },
    }
  });
}
