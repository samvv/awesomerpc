
import type { RPC } from "./rpc.js";
import type { Impl, ClientObj } from "./types.js";

export function createProxy<I extends Impl>(rpc: RPC<I>) {
  return new Proxy<ClientObj<I['remote']['methods'], I['local']['events']>>({} as any, {
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
