// TokenCreateStore — крошечный subscribable open-store, разделяющий состояние
// «модалка создания токена открыта» между кнопкой в шапке страницы (tokensTab
// headerAction в registerExtensions) и телом панели (SaKeysPanel/UserTokensPanel),
// которые монтируются в РАЗНЫХ поддеревьях (header-slot vs зона-3) и не имеют общего
// React-родителя. Один store на инстанс таба (создаётся в extraTabs). Паттерн
// useSyncExternalStore — как context-store (codestyles C10).

import { useSyncExternalStore } from "react";

export interface OpenStore {
  set: (open: boolean) => void;
  subscribe: (cb: () => void) => () => void;
  get: () => boolean;
}

// createOpenStore — фабрика store'а (по одному на инстанс таба).
export function createOpenStore(): OpenStore {
  let open = false;
  const listeners = new Set<() => void>();
  return {
    set(next: boolean) {
      if (open === next) return;
      open = next;
      listeners.forEach((l) => l());
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get() {
      return open;
    },
  };
}

// useOpenStore — реактивная подписка на open-store.
export function useOpenStore(store: OpenStore): boolean {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
