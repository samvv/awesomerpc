import type { ValidationError } from "reflect-types"

export class RPCError extends Error {
}

/**
 * An error that was caused by the remote doing something wrong.
 */
export class RemoteError extends RPCError {
}

export class ProtocolError extends RemoteError {
}

export class MethodNotFoundError extends RemoteError {
  public constructor(public methodName: string) {
    super(`Method '${methodName}' not found.`)
  }
}

export class ParamCountMismatchError extends RemoteError {
  public constructor(
    public expected: number,
    public actual: number,
  ) {
    super(`Invalid number of parameters received. Expected ${expected}, got ${actual}`)
  }
}

export class EventNotFoundError extends RemoteError {
  public constructor(public eventName: string) {
    super(`Requested event named '${eventName}' not found on this RPC object.`)
  }
}

export class FailedValidationError extends RemoteError {
  public constructor(
    public actual: any,
    public errors: ValidationError[]
  ) {
    const msg = errors.map(e => e.message).join(', ');
    super(`contract error on value ${actual}: ${msg}`);
  }
}
