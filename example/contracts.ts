import t from "reflect-types";
import { contract } from "awesomerpc";

import { productT } from "./types.js";

export const petStoreServer = contract({
    methods: {
        getProducts: t.callable([] as const, t.array(productT)),
        authenticate: t.callable(
            [
                t.string(), // username
                t.string(), // password
            ] as const,
            t.boolean(), // success or not
        ),
    },
});

export const petStoreClient = contract({
    // These methods the server can call on the client at any time
    methods: {
        refresh: t.callable([] as const, t.void_()),
    },
    events: {
        logout: t.undefined(),
    },
});

