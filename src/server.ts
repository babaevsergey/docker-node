import 'reflect-metadata';

import { Container } from './container.js';
import { Controller } from './decorators/controller.js';
import { Get } from './decorators/methods.js';
import { Dispatcher } from './dispatcher.js';
import { Router } from './router.js';

@Controller()
class AppController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get()
  index(): { service: string } {
    return { service: 'mini-nest' };
  }
}

const container = new Container();
const router = new Router([AppController]);
const server = new Dispatcher(container, router).createServer();

await new Promise<void>((resolve) => {
  server.listen(3000, '0.0.0.0', resolve);
});

console.log('mini-nest is listening on http://0.0.0.0:3000');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
