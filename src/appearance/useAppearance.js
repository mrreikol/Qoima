import { useSyncExternalStore } from "react";

const serverSnapshot = Object.freeze({
  preference: "system",
  resolvedTheme: "light",
  storageAvailable: true,
});
const getServerSnapshot = () => serverSnapshot;
const serverStore = {
  subscribe: () => () => {},
  getSnapshot: getServerSnapshot,
  setPreference: () => {},
};

export function useAppearance() {
  const store =
    (typeof window !== "undefined" && window.QoimaAppearance) || serverStore;
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot,
  );
  return { ...snapshot, setPreference: store.setPreference };
}
