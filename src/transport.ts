import { Subject } from "rxjs";

type WriteFn = (data: string) => Promise<void> | void;

export interface Transport {
  write: WriteFn;
  open(): Promise<void>;
  close(): Promise<void>;
  readonly input: Subject<string>;
}

export class DummyTransport implements Transport {

  public constructor(
    public input: Subject<string>,
    public output: Subject<string>,
  ) {

  }

  public async write(data: string): Promise<void> {
    this.output.next(data);
  }

  public async open(): Promise<void> {
     
  }

  public async close(): Promise<void> {
      
  }

}

export function createDuplex(): [Transport, Transport] {
  const left = new Subject<string>();
  const right = new Subject<string>();
  return [
    new DummyTransport(left, right),
    new DummyTransport(right, left),
  ];
}

export class RawTransport implements Transport {

  public readonly input = new Subject<string>();

  public constructor(
    public write: WriteFn,
  ) {

  }

  public feed(data: string): void {
    this.input.next(data);
  }

  public async open(): Promise<void> {

  }

  public async close(): Promise<void> {
      
  }

}

export class WebSocketError extends Error {
}

export class OpenWebSocketError extends WebSocketError {
}

export class TimeoutReachedWebSocketError extends OpenWebSocketError {
  public constructor() {
    super(`Timeout limit reached while trying to connect to WebSocket`);
  }
}

export class GenericOpenWebSocketError extends OpenWebSocketError {
  public constructor() {
    super(`Failed to connect to WebSocket`)
  }
}

export class GenericWebSocketError extends WebSocketError {
  public constructor() {
    super(`WebSocket error during communication`);
  }
}

const DEFAULT_WEBSOCKET_TIMEOUT = 10000;

export class WebSocketTransport implements Transport {

  ws?: WebSocket;

  readonly input = new Subject<string>();

  // Configuration options
  timeout: number;

  public constructor(public url: string, { timeout = DEFAULT_WEBSOCKET_TIMEOUT } = {}) {
    this.timeout = timeout;
  }

  public open(): Promise<void> {
    return new Promise((accept, reject) => {
      this.ws = new WebSocket(this.url);
      let didOpen = false;
      const interval = setTimeout(() => {
        this.ws!.close();
        reject(new TimeoutReachedWebSocketError());
      }, this.timeout);
      this.ws.addEventListener('error', () =>{
        clearTimeout(interval);
        reject(didOpen ? new GenericWebSocketError() : new GenericOpenWebSocketError());
      });
      this.ws.addEventListener('open', () => {
        didOpen = true;
        clearTimeout(interval);
        this.ws!.addEventListener('message', event => {
          this.input.next(event.data.toString());
        });
        accept();
      });
    });
  }

  public close(): Promise<void> {
    return new Promise(accept => {
      const ws = this.ws!;
      if (ws.readyState === WebSocket.CLOSED) {
        accept();
        return;
      }
      const onClose = () => {
        ws.removeEventListener('close', onClose);
        accept();
      }
      ws.addEventListener('close', onClose);
      ws.close();
    });
  }

  public async write(data: string): Promise<void> {
    this.ws!.send(data);
  }

}

export class StableTransport implements Transport {

  readonly input = new Subject<string>();

  private instance?: Transport;
  private openPromise?: Promise<void>;

  private buffer: string[] = [];

  public constructor(private factory: () => Transport) {
    
  }

  public async write(data: string): Promise<void> {
    if (this.instance === undefined) {
      this.buffer.push(data);
      return;
    }
    await this.openPromise;
    return this.instance!.write(data);
  }

  public async open(): Promise<void> {
    this.instance = this.factory();
    this.openPromise = this.instance.open();
    // TODO retry open() on failure
  }

  public async close(): Promise<void> {
    if (this.instance !== undefined) {
      await this.instance.close();
      this.instance = undefined;
      this.openPromise = undefined;
    }
  }

}
