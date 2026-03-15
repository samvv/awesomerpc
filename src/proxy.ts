import type { Subject } from "rxjs";

import type { RPC } from "./rpc.js";
import type { Impl, MethodContract, EventContract } from "./types.js";
import type { CallableType } from "reflect-types";

type Promisify<T extends CallableType>
  = (...args: T['paramTypes']) => Promise<Awaited<T['returnType']>>;

type Obj<M extends Record<string, MethodContract>, E extends Record<string, EventContract>>
  = { [K in keyof M]: Promisify<M[K]> }
  & { [K in keyof E]: Subject<E[K]['ty']> };

export function createProxy<I extends Impl>(rpc: RPC<I>) {
  return new Proxy<Obj<I['remote']['methods'], I['local']['events']>>({} as any, {
    get(target, p, receiver) {
      if (typeof(p) === 'string') {
        if (rpc.impl.remote.hasMethod(p)) {
          return (...args: any[]) => rpc.callMethod(p, args as any);
        }
        if (rpc.impl.local.hasEvent(p)) {
          return rpc.getEvent(p);
        }
      }
      return Reflect.get(target, p, receiver);
    },
  });
}
