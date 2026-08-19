import { ROUTE_METADATA, type HttpMethod, type RouteMetadata } from '../http-metadata.js';

function createMethodDecorator(method: HttpMethod, path = ''): MethodDecorator {
  return (_target, propertyKey, descriptor) => {
    const handler = descriptor.value;

    if (typeof handler !== 'function') {
      throw new TypeError(`@${method} can only decorate a method: ${String(propertyKey)}`);
    }

    const metadata: RouteMetadata = { method, path };
    Reflect.defineMetadata(ROUTE_METADATA, metadata, handler);
  };
}

export function Get(path = ''): MethodDecorator {
  return createMethodDecorator('GET', path);
}

export function Post(path = ''): MethodDecorator {
  return createMethodDecorator('POST', path);
}
