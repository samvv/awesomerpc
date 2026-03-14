import { Hono } from "hono";
import { websocket } from "hono/bun";
import serve from "typedrpc/lib/serve/hono.js"
import { petStoreServerImpl } from "./server.js";

const app = new Hono();

app.get('/ws', serve(petStoreServerImpl, () => ({ loggedIn: false})));

export default {
  fetch: app.fetch,
  websocket,
}

export type App = typeof app;
