import type { ExecutionContext, Guard } from '../lifecycle.js';

export class AuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    if (context.url.pathname === '/health') return true;

    const authorization = context.request.headers.authorization;
    return typeof authorization === 'string' && authorization.trim().length > 0;
  }
}
