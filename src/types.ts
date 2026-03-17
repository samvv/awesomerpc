import { validate, type Type, type Infer, type CallableType, type UndefinedType } from "reflect-types";

import { FailedValidationError, ParamCountMismatchError } from "./error.js";
import type { Subject } from "rxjs";

function assign<O extends Record<any, any>, K extends PropertyKey, V>(obj: O, key: K, value: V): O & Record<K, V> {
  return Object.assign(obj, makeObj(key, value));
}

function makeObj<K extends PropertyKey, V>(key: K, value: V): Record<K, V> {
  return { [key]: value } as Record<K, V>;
}

export type InferTuple<Ps extends ReadonlyArray<Type>> = { [I in keyof Ps]: Infer<Ps[I]> }

type Promisify<T extends CallableType>
  = (...args: T['paramTypes']) => Promise<Awaited<T['returnType']>>;

type OptionalEvents<T extends Record<string, EventContract>> = { [K in keyof T as T[K]['ty'] extends UndefinedType ? K : never]: T[K] }
type RequiredEvents<T extends Record<string, EventContract>> = { [K in keyof T as T[K]['ty'] extends UndefinedType ? never : K]: T[K] }

export type ClientObj<L extends Contract, R extends Contract>
  = { [K in keyof R['methods']]: Promisify<R['methods'][K]>; }
  & { [K in keyof L['events']]: Subject<L['events'][K]['ty']>; }
  & ClientObjStatic<L, R>

interface ClientObjStatic<L extends Contract, R extends Contract> {
  notify<K extends keyof OptionalEvents<R['events']>>(name: K): void;
  notify<K extends keyof RequiredEvents<R['events']>>(name: K, arg: Infer<R['events'][K]['ty']>): void;
}

type Request<L extends Contract, R extends Contract, S, K extends keyof L['methods']> = {
  client: ClientObj<L, R>;
  state: S;
  args: InferTuple<L['methods'][K]['paramTypes']>;
};

type MethodFn<L extends Contract, R extends Contract, S, K extends keyof L['methods']> = (req: Request<L, R, S, K>) => Infer<L['methods'][K]['returnType']>;

export type MethodContract<Ps extends ReadonlyArray<Type> = ReadonlyArray<Type>, R extends Type = Type> = CallableType<Ps, R>;

type MethodContractIn = MethodContract;

export type EventContract<T extends Type = Type> = { ty: T; };

type EventContractIn = Type;

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

export type LitContractIn<
  M extends Record<string, MethodContract> = Record<string, MethodContract>,
  E extends Record<string, Type> = Record<string, Type>
> = {
  methods?: M,
  events?: E,
};

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

class ImplBuilder<L extends Contract, R extends Contract, S extends object = {}> {

  public constructor(
    public local: L,
    public remote: R,
  ) {

  }

  public state<S2 extends object>(): ImplBuilder2<L, R, never, S2> {
    return new ImplBuilder2(this.local, this.remote, {});
  }

  public methods<N2 extends keyof L['methods']>(procs: { [K in N2]: MethodFn<L, R, {}, K> }) {
    return new ImplBuilder2<L, R, keyof typeof procs, {}>(
      this.local,
      this.remote,
      procs
    );
  }

  public method<K extends string>(name: K, proc: MethodFn<L, R, {}, K>) {
    return new ImplBuilder2<L, R, K, {}>(
      this.local,
      this.remote,
      makeObj(name, proc)
    );
  }

  public finish(this: ImplBuilder<LitContract<{}, {}>, R>) {
    return new Impl(
      this.local,
      this.remote,
      {},
    );
  }

}

class ImplBuilder2<L extends Contract, R extends Contract, Names extends keyof L['methods'], S extends object> {

  public constructor(
    public local: L,
    public remote: R,
    public procs: { [K in Names]: MethodFn<L, R, S, K> },
  ) {

  }

  public methods<N2 extends keyof L['methods']>(procs: { [K in N2]: MethodFn<L, R, S, K> }) {
    const newM = Object.assign(this.procs, procs);
    return new ImplBuilder2<L, R, keyof typeof newM, S>(this.local, this.remote, newM);
  }

  public method<K extends string>(name: K, proc: MethodFn<L, R, S, K>): ImplBuilder2<L, R, Names | K, S> {
    const newM = assign(this.procs, name, proc);
    return new ImplBuilder2<L, R, keyof typeof newM, S>(this.local, this.remote, newM);
  }

  public finish(this: ImplBuilder2<L, R, keyof L['methods'], S>) {
    return new Impl<L, R, S>(this.local, this.remote, this.procs);
  }

}

export class Impl<
  L extends Contract,
  R extends Contract,
  S extends object = {}
> {

  public state!: S;

  public constructor(
    public local: L,
    public remote: R,
    public procs: { [K in keyof L['methods']]: MethodFn<L, R, S, K> },
  ) {

  }

  public getHandler<K extends keyof L['methods']>(name: K): MethodFn<L, R, S, K> {
    return this.procs[name];
  }

}

export function implement<
  L extends Contract,
  R extends Contract
>(local: L, remote: R) {
  return new ImplBuilder(local, remote);
}
