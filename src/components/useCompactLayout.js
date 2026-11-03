import { useSyncExternalStore } from "react";

const query = "(max-width: 600px)";
const subscribe = (notify) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
// One set of controls in the correct reading/focus order at each layout size.
export function useCompactLayout() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
