import { validate, type Type, type Infer, type CallableType } from "reflect-types";

import { FailedValidationError, ParamCountMismatchError } from "./error.js";

function assign<O extends Record<any, any>, K extends PropertyKey, V>(obj: O, key: K, value: V): O & Record<K, V> {
  return Object.assign(obj, makeObj(key, value));
}

function makeObj<K extends PropertyKey, V>(key: K, value: V): Record<K, V> {
  return { [key]: value } as Record<K, V>;
}

export type InferTuple<Ps extends ReadonlyArray<Type>> = { [I in keyof Ps]: Infer<Ps[I]> }

type MethodFn<S, Ps extends ReadonlyArray<Type>, R extends Type> = (ctx: S, ...args: InferTuple<Ps>) => Infer<R>;

export type MethodContract<Ps extends ReadonlyArray<Type> = readonly Type[], R extends Type = Type> = CallableType<Ps, R>;

type MethodContractIn = MethodContract;

export type EventContract<T extends Type = Type> = { ty: T; };

type EventContractIn = Type;

export type LitContractIn<
  M extends Record<string, MethodContract> = Record<string, MethodContract>,
  E extends Record<string, Type> = Record<string, Type>
> = {
  methods?: M,
  events?: E,
};

// export function method<Ps extends ReadonlyArray<Type>, R extends Type>(params: Ps, returns: R) {
//   return { params, returns };
// }

export interface Contract {
  methods: Record<string, MethodContract>;
  events: Record<string, EventContract>;
  hasMethod(name: string): boolean;
  hasEvent(name: string): boolean;
  validateArgs(name: string, args: any[]): any[];
  validateReturns(name: string, value: any): any;
  validateEventValue(name: string, value: any): any;
}

export class LitContract<
  M extends Record<string, MethodContract> = Record<string, MethodContract>,
  E extends Record<string, EventContract> = Record<string, EventContract>
> implements Contract {

  public constructor(
    public methods: M,
    public events: E,
  ) {

  }

  public hasMethod(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.methods, name);
  }

  public hasEvent(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.events, name);
  }

  public validateArgs(name: string, args: any[]): any[] {
    const params = this.methods[name]!.paramTypes;
    if (args.length !== params.length) {
      throw new ParamCountMismatchError(args.length, params.length);
    }
    return args.map((arg, i) => {
      const [errors, coerced] = validate(arg, params[i]!);
      if (errors.length > 0) {
        throw new FailedValidationError(arg, errors);
      }
      return coerced;
    });
  }

  public validateReturns(name: string, value: any): any {
    const [errors, coerced] = validate(value, this.methods[name]!.returnType);
    if (errors.length > 0) {
      throw new FailedValidationError(value, errors);
    }
    return coerced;
  }

  public validateEventValue(name: string, value: any): any {
    const [errors, coerced] = validate(value, this.events[name]!.ty);
    if (errors.length > 0) {
      throw new FailedValidationError(value, errors);
    }
    return coerced;
  }

}

class AnyContract implements Contract {

  public methods!: Record<string, MethodContract>;
  public events!: Record<string, EventContract>;

  public hasMethod(_name: string): boolean {
    return true;
  }

  public hasEvent(_name: string): boolean {
    return true;
  }

  public validateArgs(_name: string, args: any[]): any[] {
    return args;
  }

  public validateReturns(_name: string, value: any): any {
    return value;
  }

  public validateEventValue(_name: string, value: any) {
    return value;
  }

}

export function anyContract(): AnyContract {
  return new AnyContract();
}

export function emptyContract(): LitContract<{}, {}> {
  return new LitContract({}, {});
}

export function contract<M extends Record<string, MethodContractIn>, E extends Record<string, EventContractIn>>(spec: LitContractIn<M, E>) {
  const events = {} as any;
  for (const [k, v] of Object.entries(spec.events ?? {})) {
    events[k] = { ty: v };
  }
  return new LitContract(spec.methods ?? {} as M, events as { [K in keyof E]: EventContract<E[K]> });
}

// type FnObj<S, M extends Record<string, MethodSpec>> = { [K in keyof M]: MethodFn<S, M[K]['params'], M[K]['returns']> };

class ImplBuilder<L extends Contract, R extends Contract, S = {}> {

  public constructor(
    public local: L,
    public remote: R,
  ) {

  }

  public state<S2>(): ImplBuilder2<L, R, never, S2> {
    return new ImplBuilder2(this.local, this.remote, {});
  }

  public methods<N2 extends keyof L['methods']>(procs: { [K in N2]: MethodFn<S, L['methods'][K]['paramTypes'], L['methods'][K]['returnType']> }) {
    return new ImplBuilder2<L, R, keyof typeof procs, S>(this.local, this.remote, procs);
  }

  public method<K extends string>(name: K, proc: MethodFn<S, L['methods'][K]['paramTypes'], L['methods'][K]['returnType']>) {
    return new ImplBuilder2<L, R, K, S>(this.local, this.remote, makeObj(name, proc));
  }

  public finish() {
    return new Impl(this.local, this.remote, {});
  }

}

class ImplBuilder2<L extends Contract, R extends Contract, Names extends keyof L['methods'], S> {

  public constructor(
    public local: L,
    public remote: R,
    public procs: { [K in Names]: MethodFn<S, L['methods'][K]['paramTypes'], L['methods'][K]['returnType']> },
  ) {

  }

  public methods<N2 extends keyof L['methods']>(procs: { [K in N2]: MethodFn<S, L['methods'][K]['paramTypes'], L['methods'][K]['returnType']> }) {
    const newM = Object.assign(this.procs, procs);
    return new ImplBuilder2<L, R, keyof typeof newM, S>(this.local, this.remote, newM);
  }

  public method<K extends string>(name: K, proc: MethodFn<S, L['methods'][K]['paramTypes'], L['methods'][K]['returnType']>): ImplBuilder2<L, R, Names | K, S> {
    const newM = assign(this.procs, name, proc);
    return new ImplBuilder2(this.local, this.remote, newM);
  }

  public finish(this: ImplBuilder2<L, R, keyof L['methods'], S>) {
    return new Impl(this.local, this.remote, this.procs);
  }

}

export class Impl<M extends Record<string, MethodContract> = Record<string, MethodContract>, E extends Record<string, EventContract> = Record<string, EventContract>, R extends Contract = AnyContract, S = any> {

  public state!: S;

  public constructor(
    public local: LitContract<M, E>,
    public remote: R,
    public procs: { [K in keyof M]: MethodFn<S, M[K]['paramTypes'], M[K]['returnType']> },
  ) {

  }

  public getHandler<K extends keyof M>(name: K): MethodFn<S, M[K]['paramTypes'], M[K]['returnType']> {
    return this.procs[name];
  }

}

export function implement<
  M extends Record<string, MethodContract>,
  E extends Record<string, EventContract>,
  R extends Contract
>(local: LitContract<M, E>, remote: R) {
  return new ImplBuilder(local, remote);
}
