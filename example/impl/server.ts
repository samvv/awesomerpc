import { implement } from "awesomerpc";
import { clientContract, serverContract } from "../contracts.js";
import type { Product } from "../types.js";

const products = [
  {
    id: '6930bc19-6337-4d94-b31d-f81d55a85873',
    title: 'Bag of cat food',
    description: 'A bag full of delicious cat food of premium quality.',
    createdAt: new Date('2026-03-14T20:00:10.662Z'),
    updatedAt: new Date('2026-03-14T20:00:28.639Z'),
  }
] satisfies Product[];

type ClientState = {
  user: string | null;
  basket: Map<string, number>;
};

export function initClientState(): ClientState {
  return {
    user: null,
    basket: new Map(),
  }
}

export const serverImpl = implement(serverContract, clientContract)
  .state<ClientState>()
  .method('login', ({ state, args: [ username, password ] }) => {
    if (username === 'foobar' && password === '12345') {
      state.user = username;
    }
    return false;
  })
  .method('logout', req => {
    req.state.user = null;
    req.client.notify('logout');
  })
  .method('addToBasket', ({ state, args: [ productId ] }) => {
    const count = state.basket.get(productId) ?? 0;
    state.basket.set(productId, count + 1);
  })
  .method('getBasket', ({ state }) => {
    return {
      items: products
        .map(prod => ({ ...prod, count: state.basket.get(prod.id) ?? 0 }))
        .filter(prod => prod.count > 0)
      }
  })
  .method('clearBasket', ({ state }) => {
    state.basket.clear();
  })
  .finish();

