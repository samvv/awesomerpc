import { implement } from "typedrpc";
import { petStoreServer } from "./contracts.js";
import type { Product } from "./types.js";

type ServerState = {
    loggedIn: boolean;
}

export const petStoreServerImpl = implement(petStoreServer)
    .state<ServerState>()
    .method('authenticate', (ctx, username, password) => {
        if (username === 'foobar' && password === '12345') {
            return ctx.loggedIn = true;
        }
        return false;
    })
    .method('getProducts', (_ctx) => {
        return [
            {
                id: '6930bc19-6337-4d94-b31d-f81d55a85873',
                title: 'Bag of cat food',
                description: 'A bag full of delicious cat food of premium quality.',
                createdAt: new Date('2026-03-14T20:00:10.662Z'),
                updatedAt: new Date('2026-03-14T20:00:28.639Z'),
            }
        ] satisfies Product[];
    })
    .finish();
