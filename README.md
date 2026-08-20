# mini-nest

Навчальна реалізація IoC-контейнера та HTTP-шару на TypeScript. Проєкт будує
граф залежностей, читає маршрути з декораторів, обробляє запити через
`node:http`, підставляє аргументи методів і валідує DTO. Готові DI- та
HTTP-фреймворки не використовуються.

## Запуск

Локально потрібен Node.js 22+:

```bash
npm ci
npm test
```

У Docker:

```bash
docker compose build api
docker compose run --rm api npm test
```

Запуск HTTP-сервера:

```bash
docker compose up --build
curl http://localhost:3000/health
curl -H 'Authorization: Bearer demo' http://localhost:3000/users/1
```

## Частина 1: як працює IoC

Коли ввімкнені `experimentalDecorators` та `emitDecoratorMetadata`, TypeScript
додає до декорованого класу runtime-метадані `design:paramtypes`: масив
конструкторів, що відповідають типам параметрів конструктора. `@Injectable()`
позначає клас власними метаданими, а `Container` читає
`Reflect.getMetadata('design:paramtypes', Target)` і рекурсивно резолвить кожен
тип. Без `emitDecoratorMetadata` компілятор не генерує цей масив, тому типи
залежностей у JavaScript відсутні й автоматичний резолв неможливий. Метадані
також не з'являються на класі без жодного декоратора.

TypeScript-інтерфейси стираються під час компіляції та в `design:paramtypes`
стають `Object`. Для них використовується `@Inject(token)`, а значення або клас
реєструється під рядковим чи `Symbol`-токеном.

Singleton є стандартним scope. `@Injectable({ scope: 'transient' })` створює
новий екземпляр при кожному резолві. Під час рекурсії контейнер зберігає поточний
шлях, тому цикл завершується помилкою на кшталт
`Circular dependency detected: A -> B -> A`.

## Частина 2: маршрути та HTTP

`@Controller(prefix)` записує префікс у метадані класу. `@Get(path)` і
`@Post(path)` записують HTTP-метод та локальний шлях у метадані функції.
`Router` обходить методи prototype контролера, читає ці метадані й склеює повний
шлях. Наприклад, `@Controller('users')` разом з `@Get(':id')` створюють маршрут
`GET /users/:id`.

`Dispatcher` працює поверх `node:http`: знаходить маршрут, читає JSON body,
збирає аргументи, отримує singleton-контролер із `Container`, викликає handler і
серіалізує результат у JSON. Жодного захардкодженого списку URL немає.

### Як параметр-декоратор знає, куди підставити значення

TypeScript викликає параметр-декоратор з `parameterIndex`. Тому `@Body()`,
`@Param('id')` і `@Query('limit')` зберігають у метаданих методу мапу на кшталт
`{ 0: { source: 'param', name: 'id' } }`. Під час запиту dispatcher читає цю
мапу, створює масив `args` і кладе значення саме за збереженим індексом. Після
цього виклик `handler.apply(controller, args)` передає кожне значення на
правильне місце. Сам декоратор нічого не дістає з HTTP-запиту — він лише описує,
що пізніше має зробити dispatcher.

Для `@Body()` router додатково читає `design:paramtypes` методу. У фінальній
версії `ZodValidationPipe` перевіряє plain JSON схемою Zod 4 і створює екземпляр
DTO. Невалідне тіло дає `400` з усіма полями та причинами; валідне надходить у
handler як екземпляр DTO.

```ts
@Controller('users')
class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }
}
```

## Частина 3: життєвий цикл запиту

Dispatcher запускає кожен успішний запит у фіксованому порядку:

```text
HTTP Request
    │
    ▼
Request context middleware (AsyncLocalStorage + X-Request-Id)
    │
    ▼
Guard ── false ──► 403 Forbidden
    │ true
    ▼
Interceptor: before
    │
    ▼
Pipe (Zod transform + validation)
    │
    ▼
Handler
    │
    ▼
Interceptor: after
    │
    ▼
JSON Response

Будь-яка помилка з middleware, guard, interceptor, pipe або handler
    │
    └────────────► Exception Filter ──► 400 / 404 / 500
```

`AuthGuard` перевіряє заголовок `Authorization` до валідації й handler.
`LoggingInterceptor` обгортає наступні етапи через `next()`, тому може виміряти
повну тривалість і виконати код як до, так і після handler. `ZodValidationPipe`
працює безпосередньо з аргументом перед викликом методу. `ExceptionFilter`
знаходиться у найзовнішньому `try/catch`: він мапить `ValidationError` у 400,
`NotFoundError` у 404, а невідому помилку — у безпечний 500 без message та stack.

### Чому AsyncLocalStorage, а не глобальна змінна

Глобальна змінна `currentRequestId` спільна для всіх запитів. Поки запит A чекає
на `await`, event loop запускає запит B і перезаписує змінну; після продовження A
побачить ідентифікатор B. `AsyncLocalStorage.run()` створює окремий асинхронний
store для кожного запиту. Тому сервіс або репозиторій може викликати
`requestContext.getRequestId()` глибоко у стеку без передачі requestId через
аргументи, а десять паралельних запитів не змішують контексти. Той самий ID
повертається клієнту в заголовку `X-Request-Id`; якщо клієнт надіслав власний,
сервер зберігає саме його.

## Структура

- `src/container.ts` — рекурсивний IoC resolve і scopes.
- `src/decorators/injectable.ts`, `inject.ts` — DI-декоратори.
- `src/decorators/controller.ts` — `@Controller(prefix)`.
- `src/decorators/methods.ts` — `@Get()` та `@Post()`.
- `src/decorators/params.ts` — `@Body()`, `@Param()`, `@Query()`.
- `src/router.ts` — збір і пошук маршрутів із метаданих.
- `src/dispatcher.ts` — повний HTTP lifecycle поверх `node:http`.
- `src/context/request-context.ts` — request-id у `AsyncLocalStorage`.
- `src/guards/auth.guard.ts` — перевірка `Authorization`.
- `src/interceptors/logging.interceptor.ts` — timing навколо handler.
- `src/pipes/zod-validation.pipe.ts` — Zod 4 transform та validation.
- `src/filters/exception.filter.ts` — мапінг помилок у HTTP-відповіді.
- `src/dto/create-user.dto.ts` — приклад DTO з правилами.
- `test/lifecycle-order.test.ts` — точний порядок lifecycle та error mapping.
- `test/request-context.test.ts` — request-id і десять паралельних запитів.
- `test/` — unit та HTTP integration tests усіх трьох частин.
