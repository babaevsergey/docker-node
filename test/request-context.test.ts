import 'reflect-metadata';

import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import { Container } from '../src/container.js';
import { UsersController } from '../src/controllers/users.controller.js';
import { Dispatcher } from '../src/dispatcher.js';
import { Router } from '../src/router.js';

describe('AsyncLocalStorage request context', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = new Dispatcher(new Container(), new Router([UsersController]), {
      interceptors: [],
    }).createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );

  test('deep repository reads client request id without receiving it as an argument', async () => {
    const response = await fetch(`${baseUrl}/users/1`, {
      headers: {
        authorization: 'Bearer test-token',
        'x-request-id': 'client-request-1',
      },
    });
    const body = (await response.json()) as { requestId: string };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'client-request-1');
    assert.equal(body.requestId, 'client-request-1');
  });

  test('generates an id and returns the same value from deep code', async () => {
    const response = await fetch(`${baseUrl}/users/2`, {
      headers: { authorization: 'Bearer test-token' },
    });
    const body = (await response.json()) as { requestId: string };
    const responseId = response.headers.get('x-request-id');

    assert.ok(responseId);
    assert.equal(body.requestId, responseId);
  });

  test('keeps ten concurrent request ids isolated', async () => {
    const ids = Array.from({ length: 10 }, (_, index) => `parallel-${index}`);
    const responses = await Promise.all(
      ids.map(async (id, index) => {
        const response = await fetch(`${baseUrl}/users/${index}`, {
          headers: {
            authorization: 'Bearer test-token',
            'x-request-id': id,
          },
        });
        const body = (await response.json()) as { requestId: string };

        return {
          expected: id,
          header: response.headers.get('x-request-id'),
          deepValue: body.requestId,
        };
      }),
    );

    for (const result of responses) {
      assert.equal(result.header, result.expected);
      assert.equal(result.deepValue, result.expected);
    }
  });
});
