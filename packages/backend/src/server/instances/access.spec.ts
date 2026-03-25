import { describe, expect, test } from "vitest";
import type { Instance, User } from "shared";
import { GUEST_OWNER_ID } from "shared";
import { canReadInstance } from "./access";

const user: User = {
  id: "user-1",
  googleId: "user@example.com",
  createdAt: 1,
};

const otherUser: User = {
  id: "user-2",
  googleId: "other@example.com",
  createdAt: 1,
};

const privateInstance: Instance = {
  id: "instance-1",
  kind: "static",
  ownerId: user.id,
  createdAt: 1,
  raw: "HTTP/1.1 200 OK\r\n\r\nok",
  webhookIds: [],
  public: false,
  locked: false,
};

describe("canReadInstance", () => {
  test("allows the owner to read a private instance", () => {
    expect(
      canReadInstance({
        instance: privateInstance,
        user,
      }),
    ).toBe(true);
  });

  test("blocks other users from reading a private instance", () => {
    expect(
      canReadInstance({
        instance: privateInstance,
        user: otherUser,
      }),
    ).toBe(false);
  });

  test("allows anonymous access to public instances", () => {
    expect(
      canReadInstance({
        instance: {
          ...privateInstance,
          public: true,
        },
        user: undefined,
      }),
    ).toBe(true);
  });

  test("allows guest-owned instances to be read without auth", () => {
    expect(
      canReadInstance({
        instance: {
          ...privateInstance,
          ownerId: GUEST_OWNER_ID,
        },
        user: undefined,
      }),
    ).toBe(true);
  });
});
