/* Blocking before-paint setup, shared with the React appearance controls. */
(function initializeAppearance() {
  if (window.QoimaAppearance) return;

  const storageKey = "qoima.appearance";
  const validPreferences = ["light", "dark", "system"];
  const normalize = (value) =>
    validPreferences.includes(value) ? value : "system";
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const listeners = new Set();
  let preference = "system";
  let storageAvailable = true;
  try {
    preference = normalize(window.localStorage.getItem(storageKey));
  } catch {
    storageAvailable = false;
  }

  const resolveTheme = () =>
    preference === "system" ? (media?.matches ? "dark" : "light") : preference;
  let snapshot;

  function apply() {
    const resolvedTheme = resolveTheme();
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolvedTheme === "dark" ? "#08090a" : "#f7f8fa");
    if (
      snapshot?.preference === preference &&
      snapshot.resolvedTheme === resolvedTheme &&
      snapshot.storageAvailable === storageAvailable
    )
      return;
    snapshot = Object.freeze({ preference, resolvedTheme, storageAvailable });
    listeners.forEach((listener) => listener());
  }

  function setPreference(value) {
    if (!validPreferences.includes(value)) return;
    preference = value;
    try {
      window.localStorage.setItem(storageKey, preference);
      storageAvailable = true;
    } catch {
      // Apply this choice even when the browser cannot remember it.
      storageAvailable = false;
    }
    apply();
  }

  // This executes synchronously before the app's styles and module are loaded.
  apply();
  const onSystemChange = () => {
    if (preference === "system") apply();
  };
  if (media?.addEventListener) media.addEventListener("change", onSystemChange);
  else media?.addListener?.(onSystemChange);

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = normalize(event.newValue);
    apply();
  });

  window.QoimaAppearance = Object.freeze({
    getSnapshot: () => snapshot,
    setPreference,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
})();
