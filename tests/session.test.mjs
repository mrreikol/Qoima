import assert from "node:assert/strict";
import test from "node:test";
import { observeSession } from "../src/auth/sessionLifecycle.js";

function harness() {
  let callback,
    resolve,
    reject,
    unsubscribed = false;
  let state = { loading: true, session: null, recovery: false, error: "" };
  const auth = {
    onAuthStateChange(fn) {
      callback = fn;
      return {
        data: {
          subscription: {
            unsubscribe() {
              unsubscribed = true;
            },
          },
        },
      };
    },
    getSession() {
      return new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
    },
  };
  const cleanup = observeSession(auth, (next) => {
    state = typeof next === "function" ? next(state) : next;
  });
  return {
    get state() {
      return state;
    },
    get unsubscribed() {
      return unsubscribed;
    },
    cleanup,
    emit: (event, session) => callback(event, session),
    resolve: (value) => resolve(value),
    reject: () => reject(new Error("offline")),
  };
}
const session = (id) => ({ user: { id } });
test("initial auth loading waits for initialization and auth events beat stale getSession results", async () => {
  const auth = harness();
  assert.equal(auth.state.loading, true);
  auth.emit("SIGNED_IN", session("B"));
  auth.resolve({ data: { session: session("A") }, error: null });
  await new Promise(setImmediate);
  assert.equal(auth.state.session.user.id, "B");
  assert.equal(auth.state.loading, false);
  auth.emit("SIGNED_OUT", null);
  assert.equal(auth.state.session, null);
  auth.emit("INITIAL_SESSION", session("A"));
  assert.equal(
    auth.state.session,
    null,
    "Late initialization cannot restore a signed-out session",
  );
  auth.cleanup();
  assert.equal(auth.unsubscribed, true);
  auth.emit("SIGNED_IN", session("A"));
  assert.equal(auth.state.session, null);
});
test("recovery stays with the same account and is cleared by account switch or expired-session signout", () => {
  const auth = harness();
  auth.emit("PASSWORD_RECOVERY", session("A"));
  assert.equal(auth.state.recovery, true);
  auth.emit("TOKEN_REFRESHED", session("A"));
  assert.equal(auth.state.recovery, true);
  auth.emit("SIGNED_IN", session("B"));
  assert.equal(auth.state.recovery, false);
  auth.emit("SIGNED_OUT", null);
  assert.equal(auth.state.session, null);
  assert.equal(auth.state.recovery, false);
  auth.cleanup();
});
test("initial session failures never expose a cached session and unmount suppresses late completion", async () => {
  const auth = harness();
  auth.resolve({
    data: { session: session("A") },
    error: { message: "failed refresh" },
  });
  await new Promise(setImmediate);
  assert.equal(auth.state.session, null);
  assert.equal(auth.state.loading, false);
  assert.match(auth.state.error, /initialize/);
  auth.cleanup();
  const late = harness();
  late.cleanup();
  late.resolve({ data: { session: session("A") }, error: null });
  await new Promise(setImmediate);
  assert.equal(late.state.session, null);
  assert.equal(late.state.loading, true);
  const failed = harness();
  failed.reject();
  await new Promise(setImmediate);
  assert.equal(failed.state.session, null);
  assert.match(failed.state.error, /initialize/);
  failed.cleanup();
});
