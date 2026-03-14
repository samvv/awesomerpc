import type { Subject } from "rxjs";

import type { RPC } from "./rpc.js";
import type { Impl, Spec, MethodSpec, EventSpec } from "./types.js";
import type { CallableType } from "reflect-types";

type Promisify<T extends CallableType>
  = (...args: T['paramTypes']) => Promise<Awaited<T['returnType']>>;

type Obj<M extends Record<string, MethodSpec>, E extends Record<string, EventSpec>>
  = { [K in keyof M]: Promisify<M[K]> }
  & { [K in keyof E]: Subject<E[K]['ty']> };

export function createProxy<L extends Impl, R extends Spec>(rpc: RPC<L, R>) {
  return new Proxy<Obj<R['methods'], L['spec']['events']>>({} as any, {
    get(target, p, receiver) {
      if (typeof(p) === 'string') {
        if (rpc.remote.hasMethod(p)) {
          return (...args: any[]) => rpc.callMethod(p, args as any);
        }
        if (rpc.local.spec.hasEvent(p)) {
          return rpc.getEvent(p);
        }
      }
      return Reflect.get(target, p, receiver);
    },
  });
}
