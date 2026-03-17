import { Hono } from "hono";
import { websocket } from "hono/bun";
import serve from "awesomerpc/lib/serve/hono.js"
import { initClientState, serverImpl } from "./impl/server.js";

const app = new Hono();

app.get('/ws', serve(serverImpl, initClientState));

export default {
  fetch: app.fetch,
  websocket,
}

export type App = typeof app;
