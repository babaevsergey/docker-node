import { INJECT_TOKENS_METADATA, type InjectionToken } from '../tokens.js';

export function Inject(token: InjectionToken): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const current =
      (Reflect.getOwnMetadata(INJECT_TOKENS_METADATA, target) as
        Map<number, InjectionToken> | undefined) ?? new Map<number, InjectionToken>();

    current.set(parameterIndex, token);
    Reflect.defineMetadata(INJECT_TOKENS_METADATA, current, target);
  };
}
