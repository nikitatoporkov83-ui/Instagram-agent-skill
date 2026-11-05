# Подключение Instagram

Код поддерживает официальный Instagram Login и публикацию JPEG-фото и MP4-Reels
после подтверждения. Само наличие кода не привязывает аккаунт: нужны приложение
Meta, размещённый сервер и вход владельца через Instagram.

Сайт остаётся на GitHub Pages. Сервер `backend/` размещается на Cloudflare Workers
с базой D1. Токен Instagram зашифрован на сервере; браузер получает HttpOnly-сессию.

## 1. Создайте Cloudflare

Зарегистрируйтесь на https://dash.cloudflare.com/ под своей почтой.
Если настройку продолжает Codex, создайте API-токен для вашего аккаунта с правами
Workers Scripts: Edit, D1: Edit и Account Settings: Read. Дополнительные права
добавляйте только по результату конкретной операции, если Cloudflare их потребует.

В защищённых настройках облачной среды укажите:

- `CLOUDFLARE_API_TOKEN` — секрет с назначением `api.cloudflare.com`;
- `CLOUDFLARE_ACCOUNT_ID` — обычная переменная с ID вашего аккаунта.

Значение токена в чат не отправляйте. После настройки доступов Codex сможет
создать сервер и базу. Если хотите выполнить настройку самостоятельно, нужен Node.js 22+:

```bash
cd backend
npm ci
npm test
npx wrangler login
npx wrangler d1 create insta-studio
```

При настроенном API-токене `wrangler login` не нужен. Выданный `database_id`
перенесите в `backend/wrangler.toml` вместо нулевого UUID. Это не секрет.

```bash
npx wrangler d1 migrations apply insta-studio --remote
npx wrangler deploy
```

Сохраните выданный HTTPS-адрес Worker — ваш `PUBLIC_API_URL`. Создайте ключ
шифрования без вывода его значения в чат:

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Ключ нужно сохранить в защищённом хранилище владельца. Не создавайте новый при
обычном обновлении кода: замена ключа требует переподключения аккаунтов.

## 2. Создайте приложение Meta

Откройте https://developers.facebook.com/apps/ и создайте своё приложение.
Добавьте Instagram API с вариантом **Instagram Login** для профессионального
аккаунта. Нужны только `instagram_business_basic` и
`instagram_business_content_publish`. Сообщения и комментарии не запрашиваются.
Не используйте устаревший Instagram Basic Display API.

В режиме разработки добавьте свой аккаунт в роли/тестеры приложения и подтвердите
приглашение. Для сторонних пользователей могут потребоваться проверка приложения
и расширенный доступ: актуальные требования показывает панель Meta.

Укажите адреса, заменив `PUBLIC_API_URL` реальным HTTPS-адресом сервера:

| Настройка | Адрес |
| --- | --- |
| OAuth redirect URI | `PUBLIC_API_URL/oauth/callback` |
| Deauthorization callback | `PUBLIC_API_URL/oauth/deauthorize` |
| Data deletion callback | `PUBLIC_API_URL/data-deletion` |
| Политика данных | `https://nikitatoporkov83-ui.github.io/Instagram-agent-skill/privacy.html` |
| Удаление данных | `https://nikitatoporkov83-ui.github.io/Instagram-agent-skill/deletion.html` |

В настройках Worker задайте обычные переменные:

```text
SITE_URL=https://nikitatoporkov83-ui.github.io/Instagram-agent-skill/
PUBLIC_API_URL=<реальный HTTPS-адрес Worker без пути>
INSTAGRAM_APP_ID=<Instagram App ID вашего приложения>
GRAPH_API_VERSION=v24.0
```

Сохраните соответствующий `INSTAGRAM_APP_SECRET` **секретом Worker**, а не в
GitHub или файлах сайта. В CLI это `npx wrangler secret put INSTAGRAM_APP_SECRET`,
который запрашивает значение локально. `keep_vars = true` сохраняет публичные
переменные из панели Cloudflare при обновлении сервера.

`GET /health` должен вернуть `configured: true`. Это подтверждает наличие
настроек, но не реальный вход в Instagram и не выдачу прав Meta.

## 3. Активируйте сайт и войдите

Укажите адрес Worker в публичном поле `instagramApiUrl` файла
`web/integration-config.js`. Отправьте изменение в `main`; GitHub Pages обновит сайт.
Никакие токены и секреты в этот файл добавлять нельзя.

На сайте откройте **Instagram → Подключить Instagram**. В открывшемся окне
войдите самостоятельно на официальной странице Instagram и подтвердите доступ.
Подключение отображается только после ответа сервера с вашим профилем.

Нужен браузер с поддержкой защищённых Partitioned cookies (CHIPS). Если браузер
блокирует сохранение сессии, используйте современный браузер либо разместите
сайт и API на одном origin. Сессия HttpOnly недоступна JavaScript.

## 4. Публикация

Добавьте публичную HTTPS-ссылку непосредственно на JPEG или MP4 и подпись до
2 200 символов. Можно использовать текст из черновика. Нажмите **Проверить перед
публикацией**, проверьте аккаунт, медиа и текст, затем **Опубликовать в @аккаунт**.
До последнего нажатия медиа в Instagram не передаётся.

Подтверждённая обработка Reels может завершиться после закрытия вкладки: сервер
проверяет только уже подтверждённые отправки. Повтор одного подтверждения не
создаёт ещё один пост. Если ответ Meta после отправки потерян, сервис не повторяет
её автоматически — сначала проверьте аккаунт.

В текущую версию не входят загрузка файлов в своё хранилище, карусели, Stories,
комментарии, сообщения и расписание новых публикаций. Ссылки на страницы постов
или защищённые входом файлы не подходят вместо публичного медиафайла.

## Хранение и проверка

OAuth state действует 10 минут, одноразовый handoff — 3 минуты, сессия — до 30 дней.
Передача результата входа защищена PKCE. Токены зашифрованы AES-GCM; сессии в D1
хранятся в виде хешей. История удаляется не позднее 30 дней. При истечении доступа
нужно переподключить аккаунт. Кнопка **Отключить** удаляет подключение, сессии и
историю сервиса и пытается отозвать разрешение в Meta. Обработчик подписанного
запроса удаления Meta также реализован.

```bash
npm ci --prefix backend
npm test --prefix backend
npm run check --prefix backend
python3 scripts/build_site.py
python3 -m unittest discover -s tests -v
```

Серверные тесты используют настоящую локальную D1 в Miniflare и имитатор ответов
Meta. Проверены OAuth, шифрование, CORS, подтверждение, отсутствие дублей, Reels,
сетевые ошибки и удаление данных. Это не заменяет реальный вход владельца аккаунта.

Официальные справочные адреса:

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- https://developers.cloudflare.com/workers/
- https://developers.cloudflare.com/d1/
