import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { Container } from './container.js';
import { requestContext, type RequestContext } from './context/request-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from './errors/http-errors.js';
import { ExceptionFilter } from './filters/exception.filter.js';
import { AuthGuard } from './guards/auth.guard.js';
import { LoggingInterceptor } from './interceptors/logging.interceptor.js';
import type {
  ExecutionContext,
  Guard,
  Interceptor,
  Middleware,
  Next,
  PipeTransform,
} from './lifecycle.js';
import { ZodValidationPipe } from './pipes/zod-validation.pipe.js';
import type { Router } from './router.js';

export interface DispatcherOptions {
  middlewares?: Middleware[];
  guards?: Guard[];
  interceptors?: Interceptor[];
  pipes?: PipeTransform[];
  exceptionFilter?: ExceptionFilter;
  requestContext?: RequestContext;
}

export class Dispatcher {
  private readonly middlewares: Middleware[];
  private readonly guards: Guard[];
  private readonly interceptors: Interceptor[];
  private readonly pipes: PipeTransform[];
  private readonly exceptionFilter: ExceptionFilter;
  private readonly contextStorage: RequestContext;

  constructor(
    private readonly container: Container,
    private readonly router: Router,
    options: DispatcherOptions = {},
  ) {
    this.middlewares = options.middlewares ?? [];
    this.guards = options.guards ?? [new AuthGuard()];
    this.interceptors = options.interceptors ?? [new LoggingInterceptor()];
    this.pipes = options.pipes ?? [new ZodValidationPipe()];
    this.exceptionFilter = options.exceptionFilter ?? new ExceptionFilter();
    this.contextStorage = options.requestContext ?? requestContext;
  }

  createServer(): Server {
    return createServer((request, response) => {
      void this.dispatch(request, response);
    });
  }

  async dispatch(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestId = getRequestId(request) ?? randomUUID();
    response.setHeader('x-request-id', requestId);

    await this.contextStorage.run(requestId, async () => {
      try {
        const url = new URL(request.url ?? '/', 'http://mini-nest.local');
        const match = this.router.find(request.method, url.pathname);

        if (!match) {
          throw new NotFoundError(
            `Route ${request.method ?? 'UNKNOWN'} ${url.pathname} was not found`,
          );
        }

        const context: ExecutionContext = {
          request,
          response,
          url,
          route: match.route,
          params: match.params,
          requestId,
        };
        const result = await this.runMiddlewares(context, () => this.runRoute(context));

        if (!response.writableEnded) {
          const statusCode = match.route.method === 'POST' ? 201 : 200;
          this.sendJson(response, statusCode, result);
        }
      } catch (error: unknown) {
        if (!response.writableEnded) {
          this.exceptionFilter.catch(error, response);
        }
      }
    });
  }

  private async runRoute(context: ExecutionContext): Promise<unknown> {
    for (const guard of this.guards) {
      if (!(await guard.canActivate(context))) {
        throw new ForbiddenError();
      }
    }

    const controller = this.container.resolve(context.route.controller) as Record<string, unknown>;
    const handler = controller[context.route.handlerName];

    if (typeof handler !== 'function') {
      throw new Error(`Handler ${context.route.handlerName} is not a method`);
    }

    return this.runInterceptors(context, async () => {
      const args = await this.buildArguments(context);
      return handler.apply(controller, args);
    });
  }

  private runMiddlewares(context: ExecutionContext, next: Next): Promise<unknown> {
    return compose(
      this.middlewares.map((middleware) => (innerNext) => middleware.use(context, innerNext)),
      next,
    );
  }

  private runInterceptors(context: ExecutionContext, next: Next): Promise<unknown> {
    return compose(
      this.interceptors.map(
        (interceptor) => (innerNext) => interceptor.intercept(context, innerNext),
      ),
      next,
    );
  }

  private async buildArguments(context: ExecutionContext): Promise<unknown[]> {
    const { request, url, route, params } = context;
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
      let value: unknown;

      if (parameter.source === 'param') {
        value = params[parameter.name ?? ''];
      } else if (parameter.source === 'query') {
        value = url.searchParams.get(parameter.name ?? '') ?? undefined;
      } else {
        value = body;
      }

      for (const pipe of this.pipes) {
        value = await pipe.transform(
          value,
          {
            index,
            source: parameter.source,
            name: parameter.name,
            metatype: route.parameterTypes[index],
          },
          context,
        );
      }

      args[index] = value;
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
      throw new ValidationError([{ field: 'body', constraints: ['body must contain valid JSON'] }]);
    }
  }

  private sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
    response.statusCode = statusCode;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(value ?? null));
  }
}

type Around = (next: Next) => Promise<unknown>;

function compose(steps: Around[], finalStep: Next): Promise<unknown> {
  const dispatch = (index: number): Promise<unknown> => {
    const step = steps[index];
    return step ? step(() => dispatch(index + 1)) : finalStep();
  };

  return dispatch(0);
}

function getRequestId(request: IncomingMessage): string | undefined {
  const header = request.headers['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() || undefined;
}
