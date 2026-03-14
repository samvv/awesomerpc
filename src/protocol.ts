import type { JSONArray, JSONValue } from "./util.js";
import { ProtocolError } from "./error.js";

export const TYPE_PRIMITIVE       = 0;
export const TYPE_ASYNC_GENERATOR = 1;
export const TYPE_ARRAY           = 2;
export const TYPE_OBJECT          = 3;
export const TYPE_UNDEFINED       = 4;
export const TYPE_SUBJECT         = 5;
export const TYPE_BEHAVIORSUBJECT = 6;

export const MSGID_REQUEST             = 0;
export const MSGID_RESPOND_OK          = 1;
export const MSGID_RESPOND_ERROR       = 2;
export const MSGID_EVENT               = 3;
export const MSGID_STREAM_ELEMENT      = 4;
export const MSGID_STREAM_FINISH       = 5;
export const MSGID_OBSERVABLE_EVENT    = 6;
export const MSGID_OBSERVABLE_COMPLETE = 7;
export const MSGID_OBSERVABLE_ERROR    = 8;
export const MSGID_OBSERVABLE_CLOSE    = 9;

export function isTypeId(value: number): boolean {
  // Keep in sync with the TYPE_* defitions
  return value >= 0 && value <= 6;
}

export function isEncodedValue(data: JSONValue): boolean {
  return Array.isArray(data)
      && data.length === 2
      && typeof(data[0]) === 'number'
      && isTypeId(data[0]);
}

function checkMethodId(value: any): asserts value is number {
  if (!Number.isInteger(value)) {
    throw new ProtocolError(`Expected method ID to be an integer.`);
  }
}

function checkObservableId(value: any): asserts value is number {
  if (!Number.isInteger(value)) {
    throw new ProtocolError(`Expected observable ID to be an integer.`);
  }
}

export function decodeEvent(msg: JSONArray): [string, JSONValue] {
  if (msg.length !== 3) {
    throw new ProtocolError(`Expected EVENT message to be a JSON array with exactly three elements.`);
  }
  const name = msg[1];
  if (typeof(name) !== 'string') {
    throw new ProtocolError(`Expected event message name to be a string.`);
  }
  const rawValue = msg[2]!;
  return [name, rawValue];
}

export function decodeRequest(msg: JSONArray): [number, string, JSONArray] {
  if (msg.length !== 4) {
    throw new ProtocolError(`Expected REQUEST message to be a JSON array with exactly four elements.`);
  }
  const id = msg[1];
  checkMethodId(id);
  const name = msg[2];
  if (typeof(name) !== 'string') {
    throw new ProtocolError(`Expected request method name to be a string.`);
  }
  const args = msg[3];
  if (!Array.isArray(args)) {
    throw new ProtocolError(`Expected request arguments list to be an array.`);
  }
  return [ id as number, name, args ]
}

export function decodeRespondOk(msg: JSONArray): [number, JSONValue] {
  if (msg.length !== 3) {
    throw new ProtocolError(`Expected RESPOND_OK message to be a JSON array with exactly three elements.`);
  }
  const id = msg[1]!;
  checkMethodId(id);
  const value = msg[2]!;
  return [ id as number, value ];
}

export function decodeRespondError(msg: JSONArray): [number, string] {
  if (msg.length !== 3) {
    throw new ProtocolError(`Expected RESPOND_ERROR message to be a JSON array with exactly three elements.`);
  }
  const id = msg[1]!;
  checkMethodId(id);
  const message = msg[2]!;
  if (typeof(message) !== 'string') {
    throw new ProtocolError(`Expected response error message to be a string.`);
  }
  return [ id as number, message ];
}

export function decodeStreamElement(msg: JSONArray): [number, JSONValue] {
  if (msg.length !== 3) {
    throw new ProtocolError(`Expected STREAM_ELEMENT message to contain 3 elements.`);
  }
  const id = msg[1]!;
  if (typeof(id) !== 'number') {
    throw new ProtocolError(`Expected message ID to be a positive integer.`);
  }
  const rawValue = msg[2]!;
  if (!isEncodedValue(rawValue)) {
    throw new ProtocolError(`Expected actual stream element to be a valid encoded RPC value.`); 
  }
  return [id, rawValue];
}

export function decodeStreamFinish(msg: JSONArray): [number, JSONValue] {
  if (msg.length !== 3) {
    throw new ProtocolError(`Expected STREAM_FINISH message to contain 3 elements.`);
  }
  const id = msg[1]!;
  if (typeof(id) !== 'number') {
    throw new ProtocolError(`Expeccted generator ID to be a number.`);
  }
  const rawValue = msg[2]!;
  if (!isEncodedValue(rawValue)) {
    throw new ProtocolError(`Expected generator result value to be a valid encoded RPC value.`); 
  }
  return [id, rawValue]
}

export function decodeObservableEvent(msg: JSONArray): [number, JSONValue] {
  if (msg.length !== 3) {
    throw new ProtocolError(`Expected OBSERVABLE_EVENT message to contain 3 elements.`);
  }
  const id = msg[1]!;
  checkMethodId(id);
  const rawValue = msg[2]!;
  return [id, rawValue]
}

export function decodeObservableComplete(msg: JSONArray): [number] {
  if (msg.length !== 2) {
    throw new ProtocolError(`Expected OBSERVABLE_COMPLETE message to contain 2 elements.`);
  }
  const id = msg[1]!;
  checkObservableId(id);
  return [id];
}

export function decodeObservableClose(msg: JSONArray): [number] {
  if (msg.length !== 2) {
    throw new ProtocolError(`Expected OBSERVABLE_CLOSE message to contain 2 elements.`);
  }
  const id = msg[1]!;
  checkObservableId(id);
  return [id];
}
