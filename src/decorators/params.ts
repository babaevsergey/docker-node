import {
  ROUTE_PARAMETERS_METADATA,
  type ParameterSource,
  type RouteParametersMetadata,
} from '../http-metadata.js';

function createParameterDecorator(source: ParameterSource, name?: string): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey === undefined) {
      throw new TypeError(`@${source} can only decorate a method parameter`);
    }

    const handler = Object.getOwnPropertyDescriptor(target, propertyKey)?.value as
      Function | undefined;

    if (!handler) {
      throw new TypeError(`Cannot find decorated method ${String(propertyKey)}`);
    }

    const current =
      (Reflect.getOwnMetadata(ROUTE_PARAMETERS_METADATA, handler) as
        RouteParametersMetadata | undefined) ?? new Map();
    const updated = new Map(current);

    updated.set(parameterIndex, { source, name });
    Reflect.defineMetadata(ROUTE_PARAMETERS_METADATA, updated, handler);
  };
}

export function Body(): ParameterDecorator {
  return createParameterDecorator('body');
}

export function Param(name: string): ParameterDecorator {
  return createParameterDecorator('param', name);
}

export function Query(name: string): ParameterDecorator {
  return createParameterDecorator('query', name);
}
