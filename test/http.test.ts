import 'reflect-metadata';

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import type { Server } from 'node:http';

import { Container } from '../src/container.js';
import { Controller } from '../src/decorators/controller.js';
import { Get, Post } from '../src/decorators/methods.js';
import { Body, Param, Query } from '../src/decorators/params.js';
import { Injectable } from '../src/decorators/injectable.js';
import { Dispatcher } from '../src/dispatcher.js';
import { CreateUserDto } from '../src/dto/create-user.dto.js';
import { Router } from '../src/router.js';

@Injectable()
class UsersService {
  lastCreatedBody: CreateUserDto | undefined;

  findOne(id: string): { id: string } {
    return { id };
  }

  list(limit: string | undefined): { limit: string | undefined } {
    return { limit };
  }

  create(body: CreateUserDto): CreateUserDto {
    this.lastCreatedBody = body;
    return body;
  }
}

@Controller('users')
class UsersController {
  constructor(readonly usersService: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string): { id: string } {
    return this.usersService.findOne(id);
  }

  @Get()
  list(@Query('limit') limit: string | undefined): {
    limit: string | undefined;
  } {
    return this.usersService.list(limit);
  }

  @Post()
  create(@Body() body: CreateUserDto): CreateUserDto {
    return this.usersService.create(body);
  }
}

describe('HTTP decorators and dispatcher', () => {
  const container = new Container();
  const router = new Router([UsersController]);
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = new Dispatcher(container, router).createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test('builds and finds /users/:id from decorator metadata', () => {
    const match = router.find('GET', '/users/42');

    assert.ok(match);
    assert.equal(match.route.path, '/users/:id');
    assert.deepEqual(match.params, { id: '42' });
  });

  test('@Param supplies a path value as a handler argument', async () => {
    const response = await fetch(`${baseUrl}/users/42`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: '42' });
  });

  test('@Query supplies a query value as a separate argument', async () => {
    const response = await fetch(`${baseUrl}/users?limit=5`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { limit: '5' });
  });

  test('invalid DTO returns 400 with all validation details', async () => {
    const response = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const result = (await response.json()) as {
      errors: { field: string; constraints: string[] }[];
    };

    assert.equal(response.status, 400);
    assert.ok(result.errors.some((error) => error.field === 'email'));
    assert.match(JSON.stringify(result), /email/);
  });

  test('valid body reaches the handler as a CreateUserDto instance', async () => {
    const response = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', email: 'ada@example.com' }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      name: 'Ada',
      email: 'ada@example.com',
    });
    assert.ok(container.resolve(UsersService).lastCreatedBody instanceof CreateUserDto);
  });

  test('container creates the controller with its singleton service', () => {
    const controller = container.resolve(UsersController);
    const service = container.resolve(UsersService);

    assert.equal(controller.usersService, service);
    assert.equal(container.resolve(UsersController), controller);
  });
});
