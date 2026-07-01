# kacho-ui-future — style-рул (нормативный, Claude Code)

> Расширяет `host/codestyles.md` (не дублирует). Целевой UI: **Vite Module
> Federation** (host-shell + доменные remotes iam/vpc/dashboard), **atomic design**,
> стек AntD + Radix + Tailwind (cva/clsx/tailwind-merge) + @tanstack/react-query +
> react-router-dom + lucide-react, **рукописный** api-слой (без openapi-codegen).
> Явная цель репо — **покомпонентно зеркалить `kacho-ui`** (см. раздел G).
> План переноса наработок из `kacho-ui` — `docs/migration-from-kacho-ui.md`.

Все правила проверяемы (evidence — реальные файлы/строки). Порядок разделов:
A архитектура MF · B atomic-design · C api/данные/состояние · D формы/страницы/registry ·
E стилизация · F тесты/тулинг · G зеркалирование · H чек-листы.

---

## A. Module Federation: host / remotes / exposes / shared

**A1. Роли.** `host` — shell (rail, breadcrumb, header, роутинг, HostContext).
Remotes (`vpc`/`iam`/`dashboard`) — доменные микрофронтенды, каждый в своей папке со
своим `package.json`/`vite.config.ts`/`tsconfig`. Между собой remotes НЕ импортируются —
общаются только через host (context-prop + navigate-callback).

**A2. Конфиг remote** (`vpc/vite.config.ts:11,14-22,54`):
```ts
base: process.env.KACHO_PUBLIC_BASE || '/',
federation({
  name: 'vpc',
  filename: 'remoteEntry.js',
  exposes: { './VpcPage': './src/pages/VpcPage/index.ts', './navigation': './src/navigation.ts' },
  shared: ['antd', 'lucide-react', 'react', 'react-dom', 'react-router-dom'],
}),
build: { target: 'esnext', modulePreload: false, cssCodeSplit: false },
```
- `name` уникален; `filename` ВСЕГДА `remoteEntry.js`.
- `exposes` — ТОЛЬКО `./PageName` (точка входа lazy) + `./navigation` (sidebar).
  Пути от корня модуля через `index.ts`-barrel, не относительные.
- `base` берётся из `KACHO_PUBLIC_BASE` (в K8s: `/vpc-remote/`, `/iam-remote/`,
  `/dashboard/`) — обязательна для subpath-serve.
- `cssCodeSplit: false` — весь CSS в один bundle (иначе federation теряет стили).
- `modulePreload: false` — снимает race при загрузке remoteEntry.

**A3. Конфиг host** (`host/vite.config.ts:23-31,92-94`): federation с `remotes` из env +
localhost-fallback, БЕЗ `base`/`cssCodeSplit`:
```ts
remotes: { dashboard: process.env.KACHO_DASHBOARD_REMOTE || 'http://localhost:4175/assets/remoteEntry.js', ... },
shared: ['antd','lucide-react','react','react-dom','react-router-dom'],
build: { target: 'esnext', modulePreload: false },
```

**A4. shared — идентичен во всех модулях**, singleton. Исключение: `dashboard`
НЕ включает `react-router-dom` (нет своего роутинга) — `dashboard/vite.config.ts:31`.
Версии react/react-dom/antd в `package.json` каждого модуля ДОЛЖНЫ совпадать.

**A5. Lazy-загрузка remote в host** (`host/src/remotes/DashboardRemote.tsx:7-10`):
```ts
const DashboardPage = lazy(async () => {
  const mod = await import('dashboard/DashboardPage');
  return { default: mod.default ?? mod.DashboardPage };  // named/default polymorphism
});
// <Suspense fallback={<Spin />}><DashboardPage context={context} navigate={navigate} /></Suspense>
```

**A6. Типизация federation-импортов** — `.d.ts` на каждый remote
(`host/src/remotes/vpc.d.ts`): `declare module 'vpc/VpcPage' { … }` и
`declare module 'vpc/navigation'`. Без них TS отдаёт `any`.

**A7. navigation-контракт** (`vpc/src/navigation.ts`): экспортит
`RemoteIconName`/`RemoteNavItem`/`RemoteNavSection` + `<DOMAIN>_NAVIGATION` const
(секции с `segment` + `items[]`). Host строит rail из этих структур.

**A8. HostContext** (`host/src/utils/host-context.ts:16-19`):
`{ account: AccountRef|null, project: ProjectRef|null }`. Передаётся **prop-ом** в
каждый Page (`context={context} navigate={navigate}`), НЕ через глобальный store/Redux.
Хранится в `localStorage['kacho.context.v2']`.

**A9. Page-контракт remote**: `interface <X>PageProps { context?: HostContext;
navigate?: (path: string) => void }` (`vpc/.../VpcPage.tsx:21-28`).

**A10. Dev-процесс** — `vite build --watch` + `preview` на фикс. порту, НЕ `vite dev`
(federation требует собранный `dist/assets/remoteEntry.js`). Порты:
host 5174, dashboard 4175, vpc 4176, iam 4177 (`dev-federation.ps1`). Новый remote —
следующий свободный порт, обновить `dev-federation.ps1` + host-fallback + host `.d.ts`.

**A11. K8s** — host nginx проксирует remoteEntry через `location ^~ /vpc-remote/ {
rewrite …; proxy_pass … }` (`deploy/templates/configmap-nginx.yaml`). `KACHO_PUBLIC_BASE`
remote-Dockerfile'а ОБЯЗАН совпадать с host nginx location (`/vpc-remote/` ↔
`KACHO_PUBLIC_BASE=/vpc-remote/`).

**Анти-паттерны A:** `vite dev` как federation-source · забыть `react-router-dom` в
shared при роутинге в remote · разъехавшиеся версии react/antd · передача HostContext
через store вместо prop · отсутствие `.d.ts` · рассинхрон `KACHO_PUBLIC_BASE` ↔ nginx.

---

## B. Atomic-design

**B1. Критерии уровня:**
- **atom** — базовый блок без бизнес-логики / без fetch: `BreadcrumbPill` (button +
  lucide), `RailButton` (button + AntD Tooltip), `KachoLogo` (SVG), примитивы
  `atoms/ui/{Button,Input,Dialog}`.
- **molecule** — 2+ atoms ИЛИ atom + локальная логика (fetch/state/composition):
  `HeaderActions`, `HostBreadcrumb` (useEffect + listAccounts + Dropdown),
  `DeleteButton` (Radix Dialog + useMutation).
- **organism** — целостная секция с page-level логикой/API/навигацией: `HostShell`,
  `DetailShell`, `InlineAddressPoolCreateForm`, `ResourceListPage`.

**B2. Папка + barrel.** Компонент = папка `Name/` c `Name.tsx` + `index.ts`
(`export * from "./Name"`) + `Name.test.tsx`. Level-barrel только re-export, без логики
(`atoms/index.ts`). Barrel сложных ui-примитивов ре-экспортит и типы:
`export type { ButtonProps } from "./Button"` (`atoms/ui/index.ts`).

**B3. Форма компонента.** Arrow + `FC<Props>` + named export:
```ts
export const BreadcrumbPill: FC<BreadcrumbPillProps> = ({ children, token, active }) => { … }
```
Никаких default-export и PropTypes.

**B4. forwardRef для AntD-Dropdown-триггеров** (`ContextBreadcrumb.tsx:196-247`): AntD
инжектит `onClick`/`ref` через `cloneElement`, без `forwardRef` + `{...rest}` дропдаун
не откроется:
```ts
const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton({ ...rest }, ref) {
  return <button ref={ref} {...rest} />;
});
```

**B5. Импорты.** `import type { FC, ReactNode } from "react"` отдельно от value-импортов.
Внутри дерева компонентов — alias `@/components/...` (barrel), НЕ относительные пути.
Исключение: `@/*` alias есть в host/vpc/iam (`tsconfig.app.json:paths`), в dashboard нет.

**B6. Props.** Явный `interface`/`type`, расширение встроенных
(`ButtonHTMLAttributes<HTMLButtonElement> & { … }`), опциональные `?`. Никакого `any`.

**B7. Иконки** — `lucide-react`, размер числом `size={18}` (16/17/18), не Tailwind h/w
(не миксовать). `HostRail` держит `iconByName` record.

**B8. Композиция children.** Organism может принимать `children: ReactNode | ((ctx) =>
ReactNode)` (`HostShell.tsx:18-64`) — render-prop для проброса контекста.

**B9. Context для shared-state внутри organism** с graceful fallback вне provider:
`HeaderSlotContext` → `createPortal(children, el)` или `null` (`DetailShell.tsx:25-33`);
`useDetailHeaderIcon()` → `undefined` вне provider.

**B10. Fragment-организмы** (`GlobalResourceFormModal`, `Toaster`,
`OperationToastWatcher`) — монтируются один раз в Layout, читают router/state, рендерят
логику/side-effect, а не собственный UI-каркас.

**Анти-паттерны B:** относительные пути вместо `@/` · default-export · hardcode
цветов/размеров · fetch без cancel-flag · прямой API-вызов в atom/molecule вместо
диспатча в organism · copy-paste форм вместо composition · `useContext` без fallback.

---

## C. API / данные / состояние / auth

**C1. Рукописный api-слой** — `src/api/{client,types,resources,auth,iam,cluster}.ts`.
БЕЗ openapi-codegen (осознанный отказ). Новый домен переиспользует client/типы, не
плодит свой fetch-слой.

**C2. fetch-client** (`vpc/src/api/client.ts`): `API_BASE = ""` (same-origin,
vite-proxy/ingress). UI работает в snake_case, wire — camelCase; `api.*` оборачивает
конверсию `camelToSnake`/`snakeToCamel` (`lib/case.ts`) на отправку/приём.
`X-Request-ID` через `crypto.randomUUID()` **с try/catch fallback на Math.random**
(insecure-context http://console.kacho.local может бросить). `ApiError extends Error`
c плоскими `status`/`code`/`details`/`message`.

**C3. Async-мутации = Operation envelope.** Все Create/Update/Delete возвращают
`{operation}`; `extractOperationId(resp)` → `setPendingOpId(id)` → `useOperation(id)`
поллит `/operations/{id}` до `done`. Sync-ответ (нет `operation.id`) обрабатывается
условно (закрыть сразу). `done=true` ≠ success — проверяй `!op.error`.

**C4. react-query queryKeys (проверяемые):**
- список: `[spec.id, 'list', filterField, filterValue]`, `refetchInterval: 3000`,
  `enabled: !filterField || !!filterValue` (`use-resource-list.ts`).
- операция: `['operation', opId]`, `refetchInterval: q => q.state.data?.done ? false :
  1000`, `enabled: !!opId` (`use-operation.ts`).

**C5. Инвалидация** (`use-operation.ts:45-79`): `invalidateQueries({ queryKey:
[resourceId, 'list'] })` (prefix-match ловит все parent-фильтры) + `refetchType: 'all'`
(рефетч неактивных) + safety `setTimeout(invalidate, 1200)` против race
operation-worker↔UI. Немедленная инвалидация обязательна, delay — в дополнение.

**C6. auth (фаза E0 = anon).** `fetchAuth` — БЕЗ конверсии и БЕЗ Bearer-интерцептора,
`credentials:'include'` (cookie `ory_kratos_session`). Bootstrap identity: `GET
/iam/v1/me` → `WhoAmIResponse { subject, system_admin, cluster_viewer, accounts[]{
account_id, roles[] } }`; camelCase из gateway адаптируется вручную (`camelToSnake`).

**C7. DPoP (RFC 9449)** (`lib/dpop.ts`): приватный ECDSA P-256 в IndexedDB
(`extractable:false`); на каждый запрос новый proof-JWT (`typ:dpop+jwt`, header `{jwk}`,
payload `{htm,htu,iat,jti,ath}`). Приватный ключ не покидает браузер. НЕ слать token
querystring/plain Bearer при DPoP.

**C8. 401/403 в ApiClient** (`lib/api-client.ts:155-187`): порядок —
(1) `DPoP-Nonce` retry (взять nonce из header ДО парсинга challenge), (2) token-refresh
через `onTokenExpired()` (`skipRefresh`-флаг против loop), только потом logout/login.
`403 error=insufficient_user_authentication` → `StepUpRequiredError(acr,amr)` →
`onStepUpRequired()` модалка → replay запроса. Auth-state (token/keypair/session)
инъектится через `ApiClient.configure()` в AuthContext, не per-request-интерцептор.

**C9. Kratos wrapper** (`lib/kratos.ts`) — тонкий fetch, не SDK:
`getFlow/submitFlow/whoami` + `loginUrl/registrationUrl/recoveryUrl/settingsUrl`, все
`credentials:'include'`, результат `{ui, redirect_browser_to, flow_id, errors}`.

**C10. context-store** (`lib/context-store.ts`): singleton через
`useSyncExternalStore`, ключ `kacho.context.v2`. `setAccount()` **сбрасывает project**;
`hydrate({account?,project?})` — patch без сброса потомков (для ContextUrlSync).
Persist в try/catch (StorageQuotaExceeded).

**C11. IAM-endpoints** (`api/iam.ts`): `/iam/v1/accounts` (List, `pageSize=1000`),
`/iam/v1/projects?account_id=…`, `/iam/v1/me`,
`/iam/v1/accounts/{id}/accessBindings` (listByResource, admin-only). Реальные ручки, без
моков (mirror-правило G).

**C12. Role.rules[]** (RBAC rules-model): UI-дискриминатор `arm` выводится клиентом
(`ruleArm`): `ARM_ANCHOR`|`ARM_NAMES` (resource_names)|`ARM_LABELS` (match_labels), в
wire не шлётся. Enum-поля читать в обоих регистрах (`rule.is_system ?? rule.isSystem`).

**Анти-паттерны C:** per-request auth-интерцептор вместо configure/callbacks ·
`randomUUID` без fallback · кэш Operation-ответов не по opId · пропуск `refetchType:'all'`
· plain Bearer при DPoP · немедленный logout на первом 401 · отдельный fetch-слой на
каждый домен.

---

## D. Формы / страницы / resource-registry

**D1. resource-registry.tsx — источник истины ресурса.** `ResourceSpec`
(`lib/resource-registry.tsx:24-95`). Не все поля обязательны:
- **обязательны**: `route`, `columns`, `template`;
- **опциональны**: `fields?`, `sanitize?`, `hydrate?`, `related?`.

Из ~24 ресурсов REGISTRY: 100% route/columns/template; ~92% — `fields`; ~38% —
`sanitize` (subnets, addresses, network-interfaces, security-groups); ~8% — `hydrate`
(subnets, network-interfaces). networks/load-balancers/listeners — без sanitize/hydrate.

**D2. FormField union** (`lib/form-schema.ts:6-154`):
`String|Text|Int|Enum|Ref|Array|Bool|SgRules|Labels|Custom`. BaseField: `name,label,
required,hidden,immutable,editHidden,createOnly,visibleWhen,fullWidth`. Generic-рендер
без switch по домену.

**D3. RefField** (`form-schema.ts:81-107`): `refResource, refProjectScoped,
refQueryFromField` (dependency-filter), `refFilter` (client-predicate), `createResource`
(inline-create), `createPresetFields` (pre-fill). Пример: NIC `v4_address_ids` →
addresses фильтр по `subnet_id` + inline-create Address.

**D4. ArrayField** — `itemFields, newItem, minItems, maxItems` (таблица +/−). NIC
IPv4/IPv6 — `maxItems: 1`.

**D5. sanitize/hydrate** — form-internal ↔ wire. sanitize: `[{value:CIDR}] → [CIDR]`
(subnet), убрать `_address_kind`-дискриминатор и неактивные oneof (address),
`[{ref}] → [id]` (NIC). hydrate — обратно (edit-режим). **oneof прото** = UI-discriminator
`_x_kind` + `visibleWhen` + очистка в sanitize.

**D6. CustomField** (`render(props)→ReactNode`) — только когда не влезает в
scalar/ref/array (RoutesEditor, NicSpecFields cascader). Получает `pathPrefix`
(`network_interface_specs[0]`), конкатенировать пути через `setByPath`.

**D7. Модалки Create/Edit** — `GlobalResourceFormModal` монтируется один раз в Layout,
парсит `?modal=<spec>-create|edit` + `pathname` (containerId: projectId/`iam`/`system`)
→ `ResourceFormModal` → `InlineResourceForm`. Любая страница открывает форму через
`?modal=…&preset`.

**D8. InlineResourceForm — диспетчер по specId** (`InlineResourceForm.tsx:48-145`):
кастомные inline-формы (subnets/security-groups/address-pools/network-interfaces) ИЛИ
generic `InlineResourceCreateForm`/`EditForm`. Новый Inline*Form → обновить этот switch.

**D9. FormShell/ResourceFormBody/FormField.** `FORM_WIDTH = 820` единый
(`FormShell.tsx:16`). embedded → без карточки, standalone → `kc-surface` + PanelHeader.
`ResourceFormBody` фильтрует `editHidden/createOnly` + `visibleWhen`, immutable-path →
`ImmutableField` (🔒 read-only). `FormFieldRenderer` — switch по `field.type`
(scalar → ScalarFieldRenderer; array/sg-rules/labels/custom → спец-компоненты).

**D10. Контролы = AntD** (`Input/Select/Switch/InputNumber/DatePicker`), Radix только
для Dialog/Popover (shadcn-обёртки). НЕ Radix Select/Combobox — единообразие с AntD-Form.

**D11. Списки/детали.** `ResourceListPage` (generic, `spec.columns` + custom-render'ы
CopyableName/RefNameLink/LabelsCell + RowActionsMenu + parent-фильтр + опц. zone-фильтр).
`ResourceDetailPage` (generic, табы из `spec.related[]{childId,filterField,label}`).
`ResourceCreatePage` (standalone/nested-URL, `presetFields` locked vs `softPresetFields`
editable-defaults). Custom detail (`NetworkDetailPage`/`TargetGroupDetailPage`/
`InstanceDetailPage`) = `ResourceDetailPage` + `extraTabs`/`secondaryActions`.

**D12. related** — авто-табы child-таблиц по `filterField` (networks→subnets по
`network_id`).

**D13. VpcPage (remote) vs App.tsx (полная интеграция)** используют один REGISTRY +
одинаковую route-структуру; VpcPage — только VPC_SCOPED, App.tsx — VPC+Compute+NLB+IAM.

**Анти-паттерны D:** openapi-codegen · отдельные List/Detail/Form при достаточном spec ·
`hidden:true` вместо editHidden/createOnly · custom-форма где хватает Array/Ref/Custom ·
забыть sanitize/hydrate для oneof/byte · Radix Select вместо AntD · моки account/project ·
пропуск Operation-polling для «sync» RPC · жёсткие path-табы вместо `?tab=`.

---

## E. Стилизация (AntD + Radix + Tailwind)

**E1. `cn()` обязателен** для объединения Tailwind-классов
(`lib/utils.ts: twMerge(clsx(inputs))`). Без tailwind-merge className-override
конфликтует.

**E2. CVA — выборочно**: только **истинные вариант-компоненты** с `variant`/`size` props.
`Button` = `cva(...) + cn()` + `VariantProps<typeof buttonVariants>` (`Button.tsx:6-37`).
`Input`/`Dialog` = ТОЛЬКО `cn()` (базовые классы + className), без cva. Не навешивать cva
где нет вариантов.

**E3. Тема — двойной источник, ДОЛЖНЫ совпадать значения:**
- CSS-vars для обеих тем в `index.css` (`:root[data-theme='dark']` /
  `[data-theme='light']`): `--background`, `--kc-page`, `--kc-container`, `--kc-text`,
  `--kc-primary`, `--status-*`, `--toast-*`.
- AntD-токены в `theme.ts` (`buildTheme(mode)`, `defaultAlgorithm`/`darkAlgorithm`).
  Значения `theme.ts` PALETTE ≡ `index.css` vars (page `#0d0e12` в обоих).

**E4. Tailwind ↔ CSS-vars через HSL** (`tailwind.config.js`): `primary: { DEFAULT:
'hsl(var(--primary))' }`. Синтаксис `hsl(var(--x))` обязателен, иначе opacity-модификатор
`bg-primary/90` не работает.

**E5. Компоненты без Tailwind** (StatusBadge/ContextBadge/Toaster) — inline
`React.CSSProperties` с семантическими CSS-vars (`var(--status-ok-bg)`,
`var(--kc-primary)`), record `TONE_STYLE`/`VARIANT_ACCENT` по вариантам. Никаких
hardcode-цветов.

**E6. AntD-inline** — `theme.useToken()` (только внутри ConfigProvider):
`style={{ color: token.colorText }}` (BreadcrumbPill, OperationBanner).

**E7. Провайдеры.** Remote: `<ConfigProvider theme={buildTheme(mode)}><AntdApp>…`
(`ConfigProvider` = токены+override, `AntdApp` = message/notification/modal API, порядок
именно такой). `mode` из `useThemeMode()`.

**E8. Тему рулит HOST** — `document.documentElement.dataset.theme` через localStorage
(`host/src/App.tsx:19-30`). Remotes НЕ пишут `data-theme`, слушают MutationObserver
(`theme-context.tsx:54-61`).

**E9. Radix-примитивы** (Dialog/Select/Tabs) не имеют своих стилей — оборачивать в
компонент с `cn()` + Tailwind (`DialogContent` + Portal, рендер в body).

**E10. Typography-утилити** (`typography.css`): `.t-page-title/.t-section/.t-h3/.t-body/
.t-small/.t-label/.t-mono`. Custom utility-классы префиксовать `.kc-*`/`.t-*`, не
`.container/.header`.

**E11. `@layer base` + `@apply`** для reset (`* { @apply border-border }`,
`body { @apply bg-background text-foreground }`). `@apply` только в `@layer`/обычных
правилах, не в media-query.

**E12. Tailwind/PostCSS только в vpc/iam** (сложные remotes). host/dashboard — простые
BEM-классы `.app-*` в `styles.css`, без Tailwind.

**Gotchas E:** `scrollbar-gutter:stable` в html (AntD Modal ставит `overflow:hidden` →
прыжок) · `useToken()` только внутри ConfigProvider · синхронизировать при добавлении
цвета: tailwind.config → index.css vars → theme.ts токены → ConfigProvider override.

**Анти-паттерны E:** hardcode-цвета для темизируемых компонентов (искл. статичные акценты
иконок) · рассинхрон theme.ts↔index.css · BEM без префикса · миксовать className+style на
одном свойстве · `data-theme` из remote.

---

## F. Тесты / тулинг / verification

**F1. Jest + RTL, colocated** — `Name/Name.test.tsx`. `ts-jest` + `jsdom`
(`jest.config.cjs`). `testMatch: src/**/*.test.{ts,tsx}`. Тест на КАЖДЫЙ компонент/страницу.

**F2. `setupFilesAfterEach → src/test/setup.ts`**: mock TextEncoder/Decoder, `fetch`
(reject by default), `matchMedia`, `ResizeObserver`. Remote setup дополнительно мокает
тяжёлые deps (AntD как div/button, Monaco как div, `theme.useToken()` → токены) через
`jest.unstable_mockModule` (ESM; требует dynamic `import()`, не `jest.mock`).

**F3. Federation в host-тестах** — `moduleNameMapper` мапит `'dashboard/DashboardPage'`
→ `src/test/dashboard-remote.tsx`. Реальные remotes в host-jest НЕ импортировать.

**F4. Селекторы** — `screen.getByRole` (a11y) + `userEvent.setup()`; `data-testid` +
`data-*`-атрибуты состояния. `data-active={active || undefined}` (undefined убирает
атрибут; не `'false'`-строка). fetch-mock — `jsonResponse` helper + path-matching.

**F5. beforeEach/afterEach** — `localStorage.clear()`, `history.pushState('/')`,
`jest.restoreAllMocks()` (против state-pollution `kacho.context.v2`).

**F6. npm test** — `jest --runInBand --silent` (тихо; vpc/iam добавляют
`--passWithNoTests`). Корневой `package.json` гоняет по `--prefix host && dashboard && vpc && iam`.

**F7. ESLint flat-config** (`eslint.config.js`): `recommendedTypeChecked` + import-x +
jsx-a11y + react + react-hooks + prettier. `no-console: ['warn',{allow:['warn','error']}]`;
`consistent-type-imports: type-imports/separate-type-imports`; `react/prop-types: off`.
Для `src/**` строгие правила ослаблены (`no-explicit-any`/`no-unsafe-*`/
`no-floating-promises` off) — api-слой рукописный. Test-файлы — jest-globals.

**F8. Prettier** (единый): `semi:true, singleQuote:false, printWidth:120,
arrowParens:always, trailingComma:all, tabWidth:2`.

**F9. Stylelint** (`.stylelintrc.json`): extends standard; `at-rule-no-unknown` игнорит
`apply/config/layer/screen/tailwind`; `selector-class-pattern:null`.

**F10. tsconfig** — `tsconfig.app.json` composite (`target:ES2022, moduleResolution:
Bundler, jsx:react-jsx, strict:true`); root через project-references.

**F11. Verification-гейт (перед handoff, codestyles.md):** `npm run test` && `npm run
lint` && `npm run build`. Dev-сервер не поднимать без явной просьбы.

**Gotchas F:** E2E/Cypress НЕТ — только RTL-unit · `data-disabled` проверяется строкой ·
jsdom без ResizeObserver/matchMedia (мок в setup) · порты dev host5174/dashboard4175/vpc4176/iam4177.

---

## G. Зеркалирование kacho-ui (mirror behavior)

**G1.** Порт из `kacho-ui` — покомпонентно, поведение 1:1. Не добавлять UI, которого нет
в оригинальном flow, без явной просьбы.

**G2. Header** — page-slot + theme-toggle. НЕ добавлять search/activity/notifications/
dev/API-reachability иконки (тест `App.test.tsx:24-32` это защищает).

**G3.** Root `/` и `/accounts` очищают `kacho.context.v2` до первого рендера.

**G4.** Breadcrumb account/project — реальные IAM-ручки (`/iam/v1/accounts?pageSize=1000`,
`/iam/v1/projects?account_id=…&pageSize=1000`), без моков (тест `HostBreadcrumb.test.tsx:32-40`).

**G5.** Тесты защищают mirrored-behavior: нет лишних header-иконок, unauth rail-surface,
unselected root-breadcrumb, реальные IAM-пути.

**G6.** При портировании: определить уровень (atom/molecule/organism) → разбить на
переиспользуемые части → atoms в molecules → organism с page-логикой. Разбивка не меняет
поведение, только структуру.

---

## H. Чек-листы

**H1. Новый remote (`nlb`):**
1. `nlb/`: `package.json` (версии react/antd = host), `vite.config.ts` (name `nlb`,
   `filename:'remoteEntry.js'`, `exposes {'./NlbPage','./navigation'}`, shared идентичен,
   `base` из `KACHO_PUBLIC_BASE`, cssCodeSplit:false), copy `jest.config.cjs`,
   `eslint.config.js`+`.prettierrc`+`.stylelintrc`, `tsconfig*` composite,
   `src/test/setup.ts` (AntD-мок как vpc).
2. `src/navigation.ts` — `NLB_NAVIGATION` + reuse RemoteNav-типы.
3. host: `vite.config.ts` remote+fallback-порт, `src/remotes/nlb.d.ts` + `NlbRemote.tsx`
   (lazy+Suspense), rail-регистрация из navigation.
4. Dockerfile `ARG KACHO_PUBLIC_BASE=/nlb-remote/`; deploy nginx `location ^~ /nlb-remote/`;
   host env `KACHO_UI_NLB_UPSTREAM`.
5. `dev-federation.ps1` — watch→preview на новом порту (4178).
6. proxy-правила в `vite.config.ts` (идентичны vpc: /nlb, /iam/v1, /operations, ory).
7. Корневой `package.json` (`--prefix nlb` во всех скриптах) + newman/e2e build-матрицы.

**H2. Новый компонент:**
1. Определить уровень (B1). Папка `Name/{Name.tsx,index.ts,Name.test.tsx}`.
2. `export const Name: FC<Props> = (…) =>`; named export; barrel re-export; level-barrel update.
3. Импорты через `@/`, `import type` отдельно, lucide-иконки `size={n}`.
4. Стили: Tailwind+`cn()` (cva только если реальные варианты) ИЛИ CSS-vars-inline;
   тема через token/vars, без hardcode.
5. forwardRef если триггер AntD-Dropdown.
6. Тест RTL (getByRole/userEvent), colocated.
7. `npm run test && lint && build`.

**H3. Новый ресурс:**
1. Запись в `REGISTRY`: обязательно `route`+`columns`+`template`; при формах — `fields`;
   при wire≠form — `sanitize`/`hydrate`; child-табы — `related`.
2. Поля через FormField-union; refs — RefField (refResource/refQueryFromField/refFilter/
   createResource); массивы — ArrayField (maxItems); oneof — `_x_kind`-discriminator +
   `visibleWhen` + очистка в sanitize.
3. Routes в VpcPage/App.tsx (обычно generic ResourceList/Detail/Create).
4. Custom Inline*Form/DetailPage ТОЛЬКО при спец-layout/inline-actions; иначе generic;
   при custom Inline-форме — обновить switch `InlineResourceForm`.
5. queryKey `[spec.id,'list',…]`; инвалидация по `[spec.id,'list']`.
6. Тесты + verification-гейт.

**H4. Новая мутация:**
1. api-метод в `resources.ts` домена (не новый fetch-слой).
2. `useMutation({ mutationFn, onSuccess, onError })`; async → `extractOperationId` →
   `setPendingOpId` → `useOperation` polling; `mutation.isPending` для disabled.
3. onSuccess: `invalidateResourceList` (`[resourceId,'list']` + `refetchType:'all'` +
   safety-delay 1200) + toast + navigate/close.
4. `done=true` → проверить `!op.error`; error `{code,message,details}` в toast.
5. asymmetric-payload (attach vs detach) — раздельные builder'ы, не generic sanitize.
6. Тест happy+negative; verification-гейт.
