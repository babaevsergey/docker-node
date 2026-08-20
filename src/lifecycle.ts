import type { IncomingMessage, ServerResponse } from 'node:http';

import type { RouteDefinition } from './router.js';
import type { InjectionToken } from './tokens.js';

export interface ExecutionContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  route: RouteDefinition;
  params: Record<string, string>;
  requestId: string;
}

export type Next = () => Promise<unknown>;

export interface Middleware {
  use(context: ExecutionContext, next: Next): Promise<unknown>;
}

export interface Guard {
  canActivate(context: ExecutionContext): boolean | Promise<boolean>;
}

export interface Interceptor {
  intercept(context: ExecutionContext, next: Next): Promise<unknown>;
}

export interface ArgumentMetadata {
  index: number;
  source: 'body' | 'param' | 'query';
  name?: string;
  metatype?: InjectionToken;
}

export interface PipeTransform {
  transform(
    value: unknown,
    metadata: ArgumentMetadata,
    context: ExecutionContext,
  ): unknown | Promise<unknown>;
}
