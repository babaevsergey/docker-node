import { CONTROLLER_PREFIX_METADATA } from '../http-metadata.js';
import { Injectable } from './injectable.js';

export function Controller(prefix = ''): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(CONTROLLER_PREFIX_METADATA, prefix, target);
    Injectable()(target);
  };
}
