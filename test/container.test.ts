import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Container } from '../src/container.js';
import { Inject } from '../src/decorators/inject.js';
import { Injectable } from '../src/decorators/injectable.js';
import { CONFIG_TOKEN } from '../src/tokens.js';

describe('Container', () => {
  test('recursively resolves an A -> B -> C graph from design:paramtypes', () => {
    @Injectable()
    class C {}

    @Injectable()
    class B {
      constructor(readonly c: C) {}
    }

    @Injectable()
    class A {
      constructor(readonly b: B) {}
    }

    const result = new Container().resolve(A);

    assert.ok(result instanceof A);
    assert.ok(result.b instanceof B);
    assert.ok(result.b.c instanceof C);
  });

  test('returns the same singleton instance by default', () => {
    @Injectable()
    class SingletonService {}

    const container = new Container();

    assert.equal(container.resolve(SingletonService), container.resolve(SingletonService));
  });

  test('returns a new transient instance for every resolve', () => {
    @Injectable({ scope: 'transient' })
    class TransientService {}

    const container = new Container();

    assert.notEqual(container.resolve(TransientService), container.resolve(TransientService));
  });

  test('uses @Inject token instead of erased interface metadata', () => {
    interface Config {
      apiUrl: string;
    }

    @Injectable()
    class ApiClient {
      constructor(@Inject(CONFIG_TOKEN) readonly config: Config) {}
    }

    const config: Config = { apiUrl: 'https://example.test' };
    const container = new Container();
    container.registerValue(CONFIG_TOKEN, config);

    const client = container.resolve(ApiClient);

    assert.equal(client.config, config);
  });

  test('reports the complete class chain for a circular dependency', () => {
    const A_TOKEN = Symbol('A');
    const B_TOKEN = Symbol('B');

    interface APort {}
    interface BPort {}

    @Injectable()
    class CycleA implements APort {
      constructor(@Inject(B_TOKEN) readonly b: BPort) {}
    }

    @Injectable()
    class CycleB implements BPort {
      constructor(@Inject(A_TOKEN) readonly a: APort) {}
    }

    const container = new Container();
    container.register(A_TOKEN, CycleA);
    container.register(B_TOKEN, CycleB);

    assert.throws(
      () => container.resolve(A_TOKEN),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error instanceof RangeError, false);
        assert.match(error.message, /CycleA -> CycleB -> CycleA/);
        return true;
      },
    );
  });

  test('supports string tokens and class providers', () => {
    @Injectable()
    class Clock {}

    const container = new Container().register('CLOCK', { useClass: Clock });

    assert.ok(container.resolve('CLOCK') instanceof Clock);
  });

  test('rejects classes that are missing @Injectable()', () => {
    class Undecorated {}

    assert.throws(() => new Container().resolve(Undecorated), /Undecorated is not injectable/);
  });
});
