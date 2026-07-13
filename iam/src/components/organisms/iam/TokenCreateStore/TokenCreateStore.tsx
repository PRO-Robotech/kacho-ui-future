// TokenSecretStore — крошечный subscribable store, переносящий одноразовый секрет
// только что выпущенного токена между create-ФОРМОЙ (разворачивается в зоне-3
// detail-страницы через childCreate) и телом панели-ТАБЛИЦЫ (SaKeysPanel/
// UserTokensPanel). Форма и таблица монтируются в РАЗНЫХ поддеревьях (main-pane
// зоны-3 vs таб «Токены») и не имеют общего React-родителя: форма на success
// кладёт секрет в store и навигирует обратно на таблицу, панель подписана на store
// и показывает after-create модалку с секретом (показ ОДИН раз). Один store на
// инстанс таба (кэшируется per-subject в registerExtensions). Паттерн
// useSyncExternalStore — как context-store (codestyles C10).

import { useSyncExternalStore } from "react";

/** Секрет выпущенного токена (Operation.response) — SA-key либо user-token. */
export interface TokenSecret {
  private_key_pem?: string;
  client_id?: string;
  algorithm?: string;
  key_id?: string;
  key?: { id?: string };
}

export interface SecretStore {
  /** Положить свежий секрет (форма → после Issue) или очистить (закрытие модалки). */
  set: (secret: TokenSecret | null) => void;
  subscribe: (cb: () => void) => () => void;
  get: () => TokenSecret | null;
}

// createSecretStore — фабрика store'а (по одному на инстанс таба).
export function createSecretStore(): SecretStore {
  let secret: TokenSecret | null = null;
  const listeners = new Set<() => void>();
  return {
    set(next: TokenSecret | null) {
      if (secret === next) return;
      secret = next;
      listeners.forEach((l) => l());
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get() {
      return secret;
    },
  };
}

// useSecretStore — реактивная подписка на secret-store.
export function useSecretStore(store: SecretStore): TokenSecret | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
