import 'reflect-metadata';

import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import { Container } from '../src/container.js';
import { Controller } from '../src/decorators/controller.js';
import { Get, Post } from '../src/decorators/methods.js';
import { Body } from '../src/decorators/params.js';
import { Dispatcher } from '../src/dispatcher.js';
import { NotFoundError } from '../src/errors/http-errors.js';
import { ExceptionFilter } from '../src/filters/exception.filter.js';
import { LoggingInterceptor } from '../src/interceptors/logging.interceptor.js';
import type { Guard, Interceptor, Middleware, PipeTransform } from '../src/lifecycle.js';
import { Router } from '../src/router.js';

class LifecycleBody {
  value!: string;
}

describe('request lifecycle', () => {
  test('runs middleware, guard, interceptor, pipe and handler in exact order', async () => {
    const calls: string[] = [];

    const middleware: Middleware = {
      async use(_context, next) {
        calls.push('middleware');
        return next();
      },
    };
    const guard: Guard = {
      canActivate() {
        calls.push('guard');
        return true;
      },
    };
    const interceptor: Interceptor = {
      async intercept(_context, next) {
        calls.push('interceptor:before');
        const result = await next();
        calls.push('interceptor:after');
        return result;
      },
    };
    const pipe: PipeTransform = {
      transform(value) {
        calls.push('pipe');
        return Object.assign(new LifecycleBody(), value);
      },
    };

    @Controller('lifecycle')
    class LifecycleController {
      @Post()
      run(@Body() body: LifecycleBody): LifecycleBody {
        calls.push('handler');
        return body;
      }
    }

    const server = new Dispatcher(new Container(), new Router([LifecycleController]), {
      middlewares: [middleware],
      guards: [guard],
      interceptors: [interceptor],
      pipes: [pipe],
    }).createServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/lifecycle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'ok' }),
      });

      assert.equal(response.status, 201);
      assert.deepEqual(calls, [
        'middleware',
        'guard',
        'interceptor:before',
        'pipe',
        'handler',
        'interceptor:after',
      ]);
    } finally {
      await close(server);
    }
  });

  let server: Server;
  let baseUrl: string;
  let handlerCalls = 0;
  const logs: string[] = [];

  @Controller('checks')
  class ChecksController {
    @Get('guarded')
    guarded(): { ok: boolean } {
      handlerCalls += 1;
      return { ok: true };
    }

    @Get('logged')
    logged(): { ok: boolean } {
      return { ok: true };
    }

    @Get('missing')
    missing(): never {
      throw new NotFoundError('Requested user was not found');
    }

    @Get('boom')
    boom(): never {
      throw new Error('boom');
    }
  }

  before(async () => {
    server = new Dispatcher(new Container(), new Router([ChecksController]), {
      interceptors: [new LoggingInterceptor((message) => logs.push(message))],
      pipes: [],
      exceptionFilter: new ExceptionFilter(() => undefined),
    }).createServer();
    baseUrl = await listen(server);
  });

  after(() => close(server));

  test('AuthGuard returns 403 before the handler without Authorization', async () => {
    const response = await fetch(`${baseUrl}/checks/guarded`);

    assert.equal(response.status, 403);
    assert.equal(handlerCalls, 0);
  });

  test('LoggingInterceptor logs method, path and elapsed milliseconds', async () => {
    const response = await authorizedFetch(`${baseUrl}/checks/logged`);

    assert.equal(response.status, 200);
    assert.ok(logs.some((line) => /GET \/checks\/logged.*[0-9]+(?:\.[0-9]+)? ms/.test(line)));
  });

  test('NotFoundError becomes a meaningful 404 response', async () => {
    const response = await authorizedFetch(`${baseUrl}/checks/missing`);
    const body = (await response.json()) as { message: string };

    assert.equal(response.status, 404);
    assert.match(body.message, /user was not found/i);
  });

  test('unexpected errors become sanitized 500 responses', async () => {
    const response = await authorizedFetch(`${baseUrl}/checks/boom`);
    const body = JSON.stringify(await response.json());

    assert.equal(response.status, 500);
    assert.doesNotMatch(body, /boom|at .*\.ts:/);
    assert.match(body, /Internal server error/);
  });

  test('ExceptionFilter also catches errors thrown by an interceptor', async () => {
    @Controller('interceptor-error')
    class InterceptorErrorController {
      @Get()
      handler(): { unreachable: boolean } {
        return { unreachable: true };
      }
    }

    const throwingInterceptor: Interceptor = {
      async intercept() {
        throw new Error('private interceptor failure');
      },
    };
    const localServer = new Dispatcher(new Container(), new Router([InterceptorErrorController]), {
      guards: [{ canActivate: () => true }],
      interceptors: [throwingInterceptor],
      pipes: [],
      exceptionFilter: new ExceptionFilter(() => undefined),
    }).createServer();
    const localUrl = await listen(localServer);

    try {
      const response = await fetch(`${localUrl}/interceptor-error`);
      const body = JSON.stringify(await response.json());

      assert.equal(response.status, 500);
      assert.doesNotMatch(body, /private interceptor failure/);
    } finally {
      await close(localServer);
    }
  });
});

async function authorizedFetch(url: string): Promise<Response> {
  return fetch(url, { headers: { authorization: 'Bearer test-token' } });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
