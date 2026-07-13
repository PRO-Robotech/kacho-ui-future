import { createSecretStore, type TokenSecret } from "./TokenCreateStore";

const secret: TokenSecret = { private_key_pem: "PEM", client_id: "cid", key_id: "kid" };

describe("createSecretStore", () => {
  it("starts empty and carries a secret via set()", () => {
    const s = createSecretStore();
    expect(s.get()).toBeNull();
    s.set(secret);
    expect(s.get()).toBe(secret);
    s.set(null);
    expect(s.get()).toBeNull();
  });

  it("notifies subscribers only on change and supports unsubscribe", () => {
    const s = createSecretStore();
    let calls = 0;
    const unsub = s.subscribe(() => {
      calls += 1;
    });
    s.set(secret); // change → notify
    s.set(secret); // no change → no notify
    expect(calls).toBe(1);
    unsub();
    s.set(null); // unsubscribed → no notify (value still changes)
    expect(calls).toBe(1);
    expect(s.get()).toBeNull();
  });
});
