
export type JSONValue = null | boolean | number | string | JSONArray | JSONObject;

export type JSONObject = { [key: string]: JSONValue }

export type JSONArray = JSONValue[];

export function isPlainObject(value: any): value is Record<any, any> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null)
      && !(Symbol.toStringTag in value)
      && !(Symbol.iterator in value);
}

export class Deferred<T> {

  public promise: Promise<T>;
  public accept!: (value: T) => void;
  public reject!: (error: Error) => void;

  public constructor() {
    this.promise = new Promise((accept, reject) => {
      this.accept = accept;
      this.reject = reject;
    });
  }

}

export function isPrimitive(value: any): boolean {
  return value == null
      || typeof(value) === 'boolean'
      || typeof(value) === 'number'
      || typeof(value) === 'string'
}
