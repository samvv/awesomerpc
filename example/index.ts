import { Hono } from "hono";
import { websocket } from "hono/bun";
import serve from "awesomerpc/lib/serve/hono.js"
import { serverImpl } from "./server.js";

const app = new Hono();

app.get('/ws', serve(serverImpl, () => ({ loggedIn: false})));

export default {
  fetch: app.fetch,
  websocket,
}

export type App = typeof app;
