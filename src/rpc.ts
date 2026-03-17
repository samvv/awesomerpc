import { BehaviorSubject, Subject, Subscription } from "rxjs";
import { type Infer } from "reflect-types";

import { isPlainObject, Deferred, type JSONObject, type JSONValue, isPrimitive } from "./util.js";
import {
  decodeEvent,
  decodeObservableComplete,
  decodeObservableEvent,
  decodeRequest,
  decodeRespondError,
  decodeRespondOk,
  decodeStreamElement,
  decodeStreamFinish,
  MSGID_EVENT,
  MSGID_OBSERVABLE_CLOSE,
  MSGID_OBSERVABLE_COMPLETE,
  MSGID_OBSERVABLE_ERROR,
  MSGID_OBSERVABLE_EVENT,
  MSGID_REQUEST,
  MSGID_RESPOND_ERROR,
  MSGID_RESPOND_OK,
  MSGID_STREAM_ELEMENT,
  MSGID_STREAM_FINISH,
  TYPE_ARRAY,
  TYPE_ASYNC_GENERATOR,
  TYPE_BEHAVIORSUBJECT,
  TYPE_OBJECT,
  TYPE_PRIMITIVE,
  TYPE_SUBJECT,
  TYPE_UNDEFINED,
} from "./protocol.js";
import type { Transport } from "./transport.js";
import { EventNotFoundError, MethodNotFoundError, ProtocolError, RemoteError, RPCError, FailedValidationError } from "./error.js";
import type { Impl, InferTuple } from "./types.js";
import { createProxy } from "./proxy.js";

export class Resource<T> {

  public constructor(
    public value: T,
    public close: () => void,
  ) {

  }

}

export function isResource(value: any): value is Resource<unknown> {
  return value instanceof Resource;
}

export type NotifyFn = (eventName: string, value: any) => void;

export type MethodFn = (...args: any[]) => any;

export type AnyEvents = Record<string, Subject<any>>

export type AnyMethods = Record<string, MethodFn>;

export type RPCValue = JSONValue | AsyncIterable<any, any, any> | Resource<Subject<any>> | Resource<BehaviorSubject<any>>;

export class RPC<I extends Impl> {

  // For sending data
  private nextMessageId = 0;
  private nextStreamId = 0;
  private nextSubjectId = 0;
  private sendSubscriptions = new Map<number, Subscription>();

  // For receiving data
  private recvSubjects = new Map<number, Subject<any>>();
  private pending = new Map<number, { name: keyof I['remote']['methods'] & string; deferred: Deferred<any> }>();
  private asyncGenerators = new Map<number, { buffer: any[], deferred: Deferred<void> }>();
  private events: { [K in keyof I['local']['events']]: Subject<Infer<I['local']['events'][K]['ty']>> } = Object.create(null);

  // Internal resources
  private readerSubscription: Subscription;

  private client = createProxy(this);

  public constructor(
    private transport: Transport,
    public impl: I,
    private state: I['state'],
  ) {
    // Process incoming messages
    this.readerSubscription = transport.input.subscribe(data => {
      try {
        this.processMessage(data);
      } catch (error) {
        if (error instanceof RPCError) {
          console.warn(`[RPC] ${error}`);
        } else {
          console.error(error);
        }
      }
    });
  }

  public getEvent<K extends keyof I['local']['events'] & string>(name: K): Subject<Infer<I['local']['events'][K]['ty']>>;
  public getEvent(name: string): undefined;
  public getEvent(name: string): Subject<any> | undefined {
    if (!this.impl.local.hasEvent(name)) {
      return;
    }
    if (this.events[name] === undefined) {
      return this.events[name as keyof I['local']['events']] = new Subject<any>();
    }
    return this.events[name];
  }


  public async notify<K extends keyof I['remote']['events']>(eventName: K, value: Infer<I['remote']['events'][K]['ty']>): Promise<void> {
    await this.transport.write(JSON.stringify([ MSGID_EVENT, eventName, this.encode(value) ]));
  }

  public hasMethod(name: string) {
    return this.impl.local.hasMethod(name);
  }

  public async callMethod<K extends keyof I['remote']['methods'] & string>(name: K, args: InferTuple<I['remote']['methods'][K]['paramTypes']>): Promise<Infer<I['remote']['methods'][K]['returnType']>> {
    const id = this.nextMessageId++;
    console.log(`send REQUEST ${id}`)
    const deferred = new Deferred<any>();
    this.pending.set(id, { name, deferred });
    const encodedArgs = args.map(this.encode.bind(this));
    await this.transport.write(JSON.stringify([ MSGID_REQUEST, id, name, encodedArgs ]));
    return deferred.promise;
  }

  private encode(value: any): JSONValue {
    if (value === undefined) {
      return [ TYPE_UNDEFINED ];
    }
    if (isPrimitive(value)) {
      return [ TYPE_PRIMITIVE, value ];
    }
    if (value instanceof BehaviorSubject) {
      const id = this.nextSubjectId++;
      this.sendSubscriptions.set(id, value.subscribe({
        next: val => {
          this.transport.write(JSON.stringify([ MSGID_OBSERVABLE_EVENT, id, this.encode(val) ]));
        },
        error: err => {
          this.transport.write(JSON.stringify([ MSGID_OBSERVABLE_ERROR, id, err.toString() ]));
        },
        complete: () => {
          this.transport.write(JSON.stringify([ MSGID_OBSERVABLE_COMPLETE, id ]));
        },
      }));
      return [ TYPE_BEHAVIORSUBJECT, id, this.encode(value.value) ];
    }
    if (value instanceof Subject) {
      const id = this.nextSubjectId++;
      this.sendSubscriptions.set(id, value.subscribe({
        next: val => {
          this.transport.write(JSON.stringify([ MSGID_OBSERVABLE_EVENT, id, this.encode(val) ]));
        },
        error: err => {
          this.transport.write(JSON.stringify([ MSGID_OBSERVABLE_ERROR, id, err.toString() ]));
        },
        complete: () => {
          this.transport.write(JSON.stringify([ MSGID_OBSERVABLE_COMPLETE, id ]));
        },
      }));
      return [ TYPE_SUBJECT, id ];
    }
    if (value[Symbol.asyncIterator] !== undefined) {
      const id = this.nextStreamId++;
      (async () => {
        const iter = value[Symbol.asyncIterator]();
        for (;;) {
            // TODO implement back-pressure
            // TODO expose next() as an RPC call
            const { done, value } = await iter.next();
            if (done) {
              this.transport.write(JSON.stringify([ MSGID_STREAM_FINISH, id, this.encode(value) ]));
              break;
            }
            this.transport.write(JSON.stringify([ MSGID_STREAM_ELEMENT, id, this.encode(value) ]));
        }
      })();
      return [ TYPE_ASYNC_GENERATOR, id ];
    }
    if (Array.isArray(value)) {
      return [ TYPE_ARRAY, value.map(this.encode.bind(this)) ];
    }
    if (isPlainObject(value)) {
      const mapped = {} as JSONObject;
      for (const [k, v] of Object.entries(value)) {
        mapped[k] = this.encode(v);
      }
      return [ TYPE_OBJECT, mapped ];
    }
    throw new RPCError(`Could not encode value ${value}`);
  }


  private decode(value: JSONValue): any {
    if (!Array.isArray(value)) {
      throw new ProtocolError(`Could not decode value: received value is not a tagged array.`);
    }
    switch (value[0]) {
      case TYPE_UNDEFINED:
        return undefined;
      case TYPE_PRIMITIVE:
        return value[1];
      case TYPE_ARRAY:
        {
          if (!Array.isArray(value[1])) {
            throw new ProtocolError(`Trying to decode an array but the argument is not an array.`);
          }
          return value[1].map(this.decode.bind(this));
        }
      case TYPE_OBJECT:
        {
          if (!isPlainObject(value[1])) {
            throw new ProtocolError(`Trying to decode an object but the argument is not an object.`);
          }
          const mapped = {} as any;
          for (const [k, v] of Object.entries(value[1])) {
            mapped[k] = this.decode(v as any);
          }
          return mapped;
        }
      case TYPE_ASYNC_GENERATOR:
      {
        if (typeof(value[1]) !== 'number') {
          throw new Error(`Could not decode value: stream ID not a number.`);
        }
        const id = value[1];
        const buffer: any[] = [];
        let deferred = new Deferred<void>();
        const generator = {
          buffer,
          deferred,
        };
        this.asyncGenerators.set(id, generator);
        return {
          [Symbol.asyncIterator]() {
            return this;
          },
          async next() {
            if (generator.buffer.length === 0) {
              await generator.deferred.promise;
              generator.deferred = new Deferred;
            }
            return generator.buffer.shift();
          }
        }
      }
      case TYPE_SUBJECT:
      case TYPE_BEHAVIORSUBJECT:
      {
        if (value.length !== 3) {
          throw new Error(`Expected message with 3 elements but got ${value.length}.`);
        }
        if (typeof(value[1]) !== 'number') {
          throw new Error(`Could not decode value: observable ID not a number.`);
        }
        const id = value[1];

        let subject;
        if (value[0] === TYPE_BEHAVIORSUBJECT) {
          const initValue = this.decode(value[2]!);
          subject = new BehaviorSubject(initValue);
        } else {
          subject = new Subject();
        }
        this.recvSubjects.set(id, subject);

        // // We monkey-patch complete() because there seems to be no way to pass in a custom finalizer
        // const self = this;
        // const origComplete = subject.complete;
        // subject.complete = function() {
        //   self.writer(JSON.stringify([ OBSERVABLE_COMPLETE, id ]));
        //   origComplete.call(this);
        // }

        const close = () => {
          this.transport.write(JSON.stringify([ MSGID_OBSERVABLE_CLOSE, id ]));
        }

        return new Resource(subject, close);
      }
    }
  }

  private processMessage(data: string): void {
    const msg = JSON.parse(data);
    if (!Array.isArray(msg)) {
      throw new Error(`Expected message to be a JSON array.`);
    }
    if (msg.length === 0) {
      throw new ProtocolError(`Expected message to be a JSON array with at least one element.`);
    }
    const type = msg[0];
    if (typeof(type) !== 'number') {
      throw new ProtocolError(`Expected message type to be a number.`);
    }
    switch (type) {
      case MSGID_EVENT:
        {
          const [name, rawValue] = decodeEvent(msg);
          console.log(`recv EVENT ${name}`);
          const subject = this.getEvent(name);
          if (subject === undefined) {
            throw new EventNotFoundError(name);
          }
          const value = this.decode(rawValue);
          const coerced = this.impl.local.validateEventValue(name, value);
          subject.next(coerced);
          break;
        }
      case MSGID_REQUEST:
      {
        const [id, name, encodedArgs] = decodeRequest(msg);
        console.log(`recv REQUEST ${id} (${name})`);
        try {
          const args = encodedArgs.map(this.decode.bind(this));
          const method = this.impl.getHandler(name);
          if (method === undefined) {
            throw new MethodNotFoundError(name);
          }
          const validArgs = this.impl.local.validateArgs(name, args);
          Promise.resolve(method({ client: this.client, state: this.state, args: validArgs }))
            .then(value => this.transport.write(JSON.stringify([ MSGID_RESPOND_OK, id, this.encode(value) ])))
            .catch(error => this.transport.write(JSON.stringify([ MSGID_RESPOND_ERROR, id, error.message ])));
        } catch (error) {
          if (error instanceof RemoteError) {
            this.transport.write(JSON.stringify([ MSGID_RESPOND_ERROR, id, error.message ]));
            break;
          }
          throw error;
        }
        break;
      }
      case MSGID_STREAM_ELEMENT:
      {
        const [id, rawValue] = decodeStreamElement(msg);
        const element = this.decode(rawValue);
        const stream = this.asyncGenerators.get(id);
        if (stream === undefined) {
          throw new RemoteError(`Stream with ID ${id} not found.`);
        }
        stream.buffer.push({ done: false, value: element });
        stream.deferred.accept();
        break;
      }
      case MSGID_STREAM_FINISH:
      {
        const [id, rawValue] = decodeStreamFinish(msg);
        const generator = this.asyncGenerators.get(id);
        if (generator === undefined) {
          throw new RemoteError(`Async generator with ID ${id} not found.`);
        }
        generator.buffer.push({ done: true, value: this.decode(rawValue) });
        generator.deferred.accept();
        this.asyncGenerators.delete(id);
        break;
      }
      case MSGID_OBSERVABLE_EVENT:
      {
        const [id, rawValue] = decodeObservableEvent(msg);
        console.log(`recv OBSERVABLE_EVENT ${id}`);
        const sub = this.recvSubjects.get(id);
        if (sub === undefined) {
          throw new RemoteError(`Observable with ID ${id} not found.`);
        }
        sub.next(this.decode(rawValue));
        break;
      }
      case MSGID_OBSERVABLE_COMPLETE:
      {
        const [id] = decodeObservableComplete(msg);
        console.log(`recv OBSERVABLE_COMPLETE ${id}`);
        const subscriber = this.recvSubjects.get(id);
        if (subscriber === undefined) {
          throw new Error(`Observable with ID ${id} not found.`);
        }
        subscriber.complete();
        this.recvSubjects.delete(id);
        break;
      }
      case MSGID_OBSERVABLE_CLOSE:
      {
        const [id] = msg[1];
        console.log(`recv OBSERVABLE_CLOSE ${id}`);
        const sub = this.sendSubscriptions.get(id);
        if (sub === undefined) {
          throw new RemoteError(`Could not find subscription with ID ${id}`);
        }
        sub.unsubscribe();
        this.sendSubscriptions.delete(id);
        break;
      }
      case MSGID_RESPOND_OK:
      {
        const [id, value] = decodeRespondOk(msg);
        console.log(`recv RESPOND_OK ${id}`);
        const result = this.pending.get(id);
        if (result === undefined) {
          throw new RemoteError(`Pending request with ID ${id} not found.`);
        }
        const { name, deferred } = result;
        this.pending.delete(id);
        const decoded = this.decode(value);
        let coerced;
        try {
          coerced = this.impl.remote.validateReturns(name, decoded);
        } catch (error) {
          if (error instanceof FailedValidationError) {
            deferred.reject(error);
            break;
          }
          throw error;
        }
        deferred.accept(coerced);
        break;
      }
      case MSGID_RESPOND_ERROR:
      {
        const [id, message] = decodeRespondError(msg);
        console.log(`recv RESPOND_ERROR ${id}`);
        const result = this.pending.get(id);
        if (result === undefined) {
          throw new RemoteError(`Pending request with ID ${id} not found for error response`);
        }
        const { deferred } = result;
        deferred.reject(new Error(message));
        this.pending.delete(id);
        break;
      }
      default:
        throw new ProtocolError(`Invalid type code (${type}).`);
    }
  }

  public close(): void {
    this.readerSubscription.unsubscribe();
  }

}

export function connect<I extends Impl>(impl: I, transport: Transport, state?: I['state']): RPC<I> {
  return new RPC(transport, impl, state);
}
