import {
  CONTROLLER_PREFIX_METADATA,
  ROUTE_METADATA,
  ROUTE_PARAMETERS_METADATA,
  type HttpMethod,
  type RouteMetadata,
  type RouteParametersMetadata,
} from './http-metadata.js';
import type { Constructor, InjectionToken } from './tokens.js';

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  controller: Constructor<object>;
  handlerName: string;
  parameters: RouteParametersMetadata;
  parameterTypes: InjectionToken[];
  pattern: RegExp;
  parameterNames: string[];
}

export interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
}

export class Router {
  private readonly routes: RouteDefinition[] = [];

  constructor(controllers: readonly Constructor<object>[] = []) {
    for (const controller of controllers) {
      this.registerController(controller);
    }
  }

  registerController(controller: Constructor<object>): this {
    const prefix = Reflect.getMetadata(CONTROLLER_PREFIX_METADATA, controller) as
      string | undefined;

    if (prefix === undefined) {
      throw new Error(`${controller.name} is not a controller. Add @Controller().`);
    }

    const prototype = controller.prototype as object;
    for (const handlerName of Object.getOwnPropertyNames(prototype)) {
      if (handlerName === 'constructor') continue;

      const handler = Object.getOwnPropertyDescriptor(prototype, handlerName)?.value as
        Function | undefined;
      if (!handler) continue;

      const routeMetadata = Reflect.getMetadata(ROUTE_METADATA, handler) as
        RouteMetadata | undefined;
      if (!routeMetadata) continue;

      const path = joinPaths(prefix, routeMetadata.path);
      const { pattern, parameterNames } = compilePath(path);
      const parameters =
        (Reflect.getMetadata(ROUTE_PARAMETERS_METADATA, handler) as
          RouteParametersMetadata | undefined) ?? new Map();
      const parameterTypes =
        (Reflect.getMetadata('design:paramtypes', prototype, handlerName) as
          InjectionToken[] | undefined) ?? [];

      this.routes.push({
        method: routeMetadata.method,
        path,
        controller,
        handlerName,
        parameters,
        parameterTypes,
        pattern,
        parameterNames,
      });
    }

    return this;
  }

  find(method: string | undefined, pathname: string): RouteMatch | undefined {
    for (const route of this.routes) {
      if (route.method !== method?.toUpperCase()) continue;

      const match = route.pattern.exec(normalizePath(pathname));
      if (!match) continue;

      const params = Object.fromEntries(
        route.parameterNames.map((name, index) => [
          name,
          decodeURIComponent(match[index + 1] ?? ''),
        ]),
      );

      return { route, params };
    }

    return undefined;
  }

  getRoutes(): readonly RouteDefinition[] {
    return this.routes;
  }
}

function joinPaths(prefix: string, path: string): string {
  return normalizePath(`${prefix}/${path}`);
}

function normalizePath(path: string): string {
  const normalized = `/${path}`.replace(/\/+/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

function compilePath(path: string): {
  pattern: RegExp;
  parameterNames: string[];
} {
  if (path === '/') {
    return { pattern: /^\/$/, parameterNames: [] };
  }

  const parameterNames: string[] = [];
  const segments = path.slice(1).split('/');
  const pattern = segments
    .map((segment) => {
      if (segment.startsWith(':')) {
        const name = segment.slice(1);
        if (!name) throw new Error(`Invalid route parameter in ${path}`);
        parameterNames.push(name);
        return '([^/]+)';
      }

      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return {
    pattern: new RegExp(`^/${pattern}/?$`),
    parameterNames,
  };
}
