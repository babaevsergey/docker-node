import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { Container } from './container.js';
import type { RouteDefinition, Router } from './router.js';
import { ValidationException, ValidationPipe } from './pipes/validation.pipe.js';
import type { Constructor, InjectionToken } from './tokens.js';

export class Dispatcher {
  constructor(
    private readonly container: Container,
    private readonly router: Router,
    private readonly validationPipe = new ValidationPipe(),
  ) {}

  createServer(): Server {
    return createServer((request, response) => {
      void this.dispatch(request, response);
    });
  }

  async dispatch(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://mini-nest.local');
      const match = this.router.find(request.method, url.pathname);

      if (!match) {
        this.sendJson(response, 404, { message: 'Route not found' });
        return;
      }

      const args = await this.buildArguments(request, url, match.route, match.params);
      const controller = this.container.resolve(match.route.controller) as Record<string, unknown>;
      const handler = controller[match.route.handlerName];

      if (typeof handler !== 'function') {
        throw new Error(`Handler ${match.route.handlerName} is not a method`);
      }

      const result = await handler.apply(controller, args);
      const statusCode = match.route.method === 'POST' ? 201 : 200;
      this.sendJson(response, statusCode, result);
    } catch (error: unknown) {
      if (error instanceof ValidationException) {
        this.sendJson(response, error.statusCode, {
          message: error.message,
          errors: error.details,
        });
        return;
      }

      if (error instanceof BadRequestException) {
        this.sendJson(response, 400, {
          message: error.message,
          errors: error.details,
        });
        return;
      }

      this.sendJson(response, 500, { message: 'Internal server error' });
    }
  }

  private async buildArguments(
    request: IncomingMessage,
    url: URL,
    route: RouteDefinition,
    params: Record<string, string>,
  ): Promise<unknown[]> {
    const bodyParameter = [...route.parameters.values()].some(
      (parameter) => parameter.source === 'body',
    );
    const body = bodyParameter ? await this.readJsonBody(request) : undefined;
    const parameterIndexes = [...route.parameters.keys()];
    const parameterCount = Math.max(
      route.parameterTypes.length,
      parameterIndexes.length === 0 ? 0 : Math.max(...parameterIndexes) + 1,
    );
    const args = Array.from<unknown>({ length: parameterCount });

    for (const [index, parameter] of route.parameters) {
      if (parameter.source === 'param') {
        args[index] = params[parameter.name ?? ''];
        continue;
      }

      if (parameter.source === 'query') {
        args[index] = url.searchParams.get(parameter.name ?? '') ?? undefined;
        continue;
      }

      const metatype = route.parameterTypes[index];
      args[index] = isDtoConstructor(metatype)
        ? await this.validationPipe.transform(body, metatype)
        : body;
    }

    return args;
  }

  private async readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) return undefined;

    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Invalid JSON body', [
        { field: 'body', constraints: ['body must contain valid JSON'] },
      ]);
    }
  }

  private sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
    response.statusCode = statusCode;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(value ?? null));
  }
}

class BadRequestException extends Error {
  constructor(
    message: string,
    readonly details: { field: string; constraints: string[] }[],
  ) {
    super(message);
  }
}

function isDtoConstructor(token: InjectionToken | undefined): token is Constructor {
  return (
    typeof token === 'function' &&
    token !== Object &&
    token !== String &&
    token !== Number &&
    token !== Boolean &&
    token !== Array
  );
}
