import 'reflect-metadata';

import {
  INJECTABLE_METADATA,
  INJECT_TOKENS_METADATA,
  SCOPE_METADATA,
  type Constructor,
  type InjectionToken,
  type Scope,
} from './tokens.js';

export interface ClassProvider<T = unknown> {
  useClass: Constructor<T>;
}

export interface ValueProvider<T = unknown> {
  useValue: T;
}

export type Provider<T = unknown> = Constructor<T> | ClassProvider<T> | ValueProvider<T>;

type NormalizedProvider = ClassProvider | ValueProvider;

export class Container {
  private readonly providers = new Map<InjectionToken, NormalizedProvider>();
  private readonly singletons = new Map<Constructor, unknown>();

  register<T>(token: InjectionToken<T>, provider: Provider<T>): this {
    this.providers.set(token, typeof provider === 'function' ? { useClass: provider } : provider);
    return this;
  }

  registerValue<T>(token: InjectionToken<T>, value: T): this {
    return this.register(token, { useValue: value });
  }

  resolve<T>(token: InjectionToken<T>): T {
    return this.resolveToken(token, []) as T;
  }

  private resolveToken(token: InjectionToken, path: readonly Constructor[]): unknown {
    const registered = this.providers.get(token);
    const provider =
      registered ??
      (this.isConstructor(token) ? ({ useClass: token } satisfies ClassProvider) : null);

    if (!provider) {
      throw new Error(`No provider registered for ${this.describeToken(token)}`);
    }

    if ('useValue' in provider) {
      return provider.useValue;
    }

    return this.resolveClass(provider.useClass, path);
  }

  private resolveClass(target: Constructor, path: readonly Constructor[]): unknown {
    if (!Reflect.getMetadata(INJECTABLE_METADATA, target)) {
      throw new Error(`${target.name || '<anonymous>'} is not injectable. Add @Injectable().`);
    }

    const scope = (Reflect.getMetadata(SCOPE_METADATA, target) as Scope | undefined) ?? 'singleton';

    if (scope === 'singleton' && this.singletons.has(target)) {
      return this.singletons.get(target);
    }

    const cycleStart = path.indexOf(target);
    if (cycleStart !== -1) {
      const chain = [...path.slice(cycleStart), target]
        .map((item) => item.name || '<anonymous>')
        .join(' -> ');
      throw new Error(`Circular dependency detected: ${chain}`);
    }

    const nextPath = [...path, target];
    const designTypes =
      (Reflect.getMetadata('design:paramtypes', target) as InjectionToken[] | undefined) ?? [];
    const injectedTokens =
      (Reflect.getOwnMetadata(INJECT_TOKENS_METADATA, target) as
        Map<number, InjectionToken> | undefined) ?? new Map<number, InjectionToken>();

    const injectedIndexes = [...injectedTokens.keys()];
    const parameterCount = Math.max(
      target.length,
      designTypes.length,
      injectedIndexes.length === 0 ? 0 : Math.max(...injectedIndexes) + 1,
    );

    const dependencies = Array.from({ length: parameterCount }, (_, index) => {
      const dependencyToken = injectedTokens.get(index) ?? designTypes[index];

      if (!dependencyToken || dependencyToken === Object) {
        throw new Error(
          `Cannot resolve parameter #${index} of ${target.name}. ` +
            'Use @Inject(token) for interfaces and erased types.',
        );
      }

      return this.resolveToken(dependencyToken, nextPath);
    });

    const instance = new target(...dependencies);
    if (scope === 'singleton') {
      this.singletons.set(target, instance);
    }

    return instance;
  }

  private isConstructor(token: InjectionToken): token is Constructor {
    return typeof token === 'function';
  }

  private describeToken(token: InjectionToken): string {
    if (typeof token === 'function') return token.name || '<anonymous>';
    return typeof token === 'symbol' ? token.toString() : JSON.stringify(token);
  }
}
