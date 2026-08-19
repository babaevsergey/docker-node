export const CONTROLLER_PREFIX_METADATA = Symbol('mini-nest:controller-prefix');
export const ROUTE_METADATA = Symbol('mini-nest:route');
export const ROUTE_PARAMETERS_METADATA = Symbol('mini-nest:route-parameters');

export type HttpMethod = 'GET' | 'POST';
export type ParameterSource = 'body' | 'param' | 'query';

export interface RouteMetadata {
  method: HttpMethod;
  path: string;
}

export interface RouteParameterMetadata {
  source: ParameterSource;
  name?: string;
}

export type RouteParametersMetadata = Map<number, RouteParameterMetadata>;
