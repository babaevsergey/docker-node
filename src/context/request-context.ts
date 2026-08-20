import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestStore {
  requestId: string;
}

export class RequestContext {
  private readonly storage = new AsyncLocalStorage<RequestStore>();

  run<T>(requestId: string, callback: () => T): T {
    return this.storage.run({ requestId }, callback);
  }

  getRequestId(): string {
    const store = this.storage.getStore();

    if (!store) {
      throw new Error('Request context is not available');
    }

    return store.requestId;
  }
}

export const requestContext = new RequestContext();
