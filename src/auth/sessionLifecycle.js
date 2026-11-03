// Keep the event callback synchronous: auth API calls in it can deadlock.
export function observeSession(auth, publish, redirectError = "") {
  let active = true;
  let authEventReceived = false;
  const {
    data: { subscription },
  } = auth.onAuthStateChange((event, session) => {
    if (!active) return;
    if (event === "INITIAL_SESSION" && authEventReceived) return;
    if (event !== "INITIAL_SESSION") authEventReceived = true;
    publish((previous) => ({
      session,
      loading: false,
      error: redirectError,
      recovery:
        !!session &&
        (event === "PASSWORD_RECOVERY" ||
          (previous.session?.user.id === session.user.id && previous.recovery)),
    }));
  });
  const failed = () => {
    if (active && !authEventReceived)
      publish({
        session: null,
        loading: false,
        recovery: false,
        error:
          "Unable to initialize your session. Check your connection and try again.",
      });
  };
  auth
    .getSession()
    .then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) {
        failed();
        return;
      }
      publish({
        session: data.session,
        loading: false,
        recovery: false,
        error: redirectError,
      });
    })
    .catch(failed);
  return () => {
    active = false;
    subscription.unsubscribe();
  };
}
