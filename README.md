# mini-nest — IoC container

Навчальна реалізація невеликого IoC-контейнера на TypeScript. Контейнер будує
граф залежностей рекурсивно, підтримує singleton/transient scope, явні токени та
показує зрозумілий ланцюг циклічної залежності. Сторонні DI-контейнери не
використовуються.

Fastify API та Docker-конфігурація з ДЗ №5 залишилися в репозиторії як середовище
запуску для наступних частин mini-Nest.

## Запуск

Локально (потрібен Node.js 22+):

```bash
npm ci
npm test
```

У Docker, використовуючи наявний сервіс `api`:

```bash
docker compose run --rm api npm test
```

Запуск Fastify API:

```bash
docker compose up --build
curl http://localhost:3000/health
```

## Як це працює

Коли ввімкнені `experimentalDecorators` та `emitDecoratorMetadata`, TypeScript
додає до декорованого класу runtime-метадані `design:paramtypes`: масив
конструкторів, що відповідають типам параметрів конструктора. `@Injectable()`
позначає клас власними метаданими, а `Container` читає
`Reflect.getMetadata('design:paramtypes', Target)` і рекурсивно резолвить кожен
тип. Без `emitDecoratorMetadata` компілятор не генерує цей масив, тому типи
залежностей у JavaScript відсутні й автоматичний резолв неможливий. Також
метадані не з'являються на класі без жодного декоратора.

TypeScript-інтерфейси стираються під час компіляції та в `design:paramtypes`
стають `Object`. У такому випадку параметр позначається `@Inject(token)`, а
значення або клас попередньо реєструється під рядковим чи `Symbol`-токеном.

```ts
const CONFIG = Symbol.for('CONFIG');

interface Config {
  apiUrl: string;
}

@Injectable()
class ApiClient {
  constructor(@Inject(CONFIG) readonly config: Config) {}
}

const container = new Container();
container.registerValue(CONFIG, { apiUrl: 'https://example.test' });
const client = container.resolve(ApiClient);
```

Singleton є стандартним scope. Для нового екземпляра при кожному резолві:

```ts
@Injectable({ scope: 'transient' })
class RequestContext {}
```

Під час рекурсивного резолву контейнер передає поточний шлях класів. Повторний
вхід у клас із цього шляху завершується помилкою на кшталт
`Circular dependency detected: A -> B -> A`.

## Структура

- `src/decorators/injectable.ts` — `@Injectable()` та scope.
- `src/decorators/inject.ts` — `@Inject(token)` для параметрів конструктора.
- `src/container.ts` — реєстрація провайдерів і рекурсивний резолв.
- `src/tokens.ts` — типи та symbol-токени метаданих.
- `test/container.test.ts` — тести основної поведінки.
