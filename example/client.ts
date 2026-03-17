import { implement } from "awesomerpc";
import { petStoreClient, petStoreServer } from "./contracts.js";

export const petStoreClientImpl = implement(petStoreClient, petStoreServer)
    .method('refresh', (_ctx) => {
        window.location.reload();
    })
    .finish();
