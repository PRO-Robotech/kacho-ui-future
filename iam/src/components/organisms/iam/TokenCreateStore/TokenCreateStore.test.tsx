import { createOpenStore } from "./TokenCreateStore";

describe("createOpenStore", () => {
  it("starts closed and toggles via set()", () => {
    const s = createOpenStore();
    expect(s.get()).toBe(false);
    s.set(true);
    expect(s.get()).toBe(true);
    s.set(false);
    expect(s.get()).toBe(false);
  });

  it("notifies subscribers only on change and supports unsubscribe", () => {
    const s = createOpenStore();
    let calls = 0;
    const unsub = s.subscribe(() => {
      calls += 1;
    });
    s.set(true); // change → notify
    s.set(true); // no change → no notify
    expect(calls).toBe(1);
    unsub();
    s.set(false); // unsubscribed → no notify
    expect(calls).toBe(1);
    expect(s.get()).toBe(false);
  });
});
