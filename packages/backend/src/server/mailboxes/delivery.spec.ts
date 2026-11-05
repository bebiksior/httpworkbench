import { describe, expect, test } from "bun:test";
import { SmtpConnectionError, type SmtpClientOptions } from "../smtp/client";
import { deliverMail, isPublicAddress, type DeliveryDeps } from "./delivery";

const config = {
  instancesDomain: "instances.example.com",
  localSmtpPort: 2525,
  heloName: "instances.example.com",
};

const createDeps = (overrides: Partial<DeliveryDeps> = {}) => {
  const attempts: SmtpClientOptions[] = [];
  const deps: DeliveryDeps = {
    send: async (options, envelope) => {
      attempts.push(options);
      return { accepted: envelope.to, rejected: [] };
    },
    resolveMx: async () => [
      { exchange: "mx2.target.com", priority: 20 },
      { exchange: "mx1.target.com", priority: 10 },
    ],
    resolveAddresses: async (host) =>
      host === "mx1.target.com"
        ? ["10.0.0.5", "93.184.216.34"]
        : ["93.184.216.35"],
    ...overrides,
  };
  return { attempts, deps };
};

const envelope = (to: string[]) => ({
  from: "a@b.instances.example.com",
  to,
  data: "x",
});

describe("isPublicAddress", () => {
  test("rejects private, loopback and mapped addresses", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:4700::1")).toBe(true);
    for (const address of [
      "127.0.0.1",
      "10.1.1.1",
      "192.168.0.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "not-an-ip",
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });
});

describe("deliverMail", () => {
  test("delivers local recipients through the built-in server", async () => {
    const { attempts, deps } = createDeps();
    const result = await deliverMail(
      config,
      envelope(["x@abc.instances.example.com"]),
      deps,
    );

    expect(result.accepted).toEqual(["x@abc.instances.example.com"]);
    expect(attempts).toMatchObject([
      { host: "127.0.0.1", port: 2525, tls: "none" },
    ]);
  });

  test("uses the preferred MX host and skips private addresses", async () => {
    const { attempts, deps } = createDeps();
    await deliverMail(config, envelope(["victim@target.com"]), deps);

    expect(attempts).toMatchObject([
      {
        host: "mx1.target.com",
        address: "93.184.216.34",
        port: 25,
        tls: "opportunistic",
      },
    ]);
  });

  test("falls back to the next MX host on connection errors", async () => {
    const { attempts, deps } = createDeps();
    deps.send = async (options, mail) => {
      attempts.push(options);
      if (options.host === "mx1.target.com") {
        throw new SmtpConnectionError("refused");
      }
      return { accepted: mail.to, rejected: [] };
    };

    const result = await deliverMail(
      config,
      envelope(["victim@target.com"]),
      deps,
    );

    expect(attempts.map(({ host }) => host)).toEqual([
      "mx1.target.com",
      "mx2.target.com",
    ]);
    expect(result.accepted).toEqual(["victim@target.com"]);
  });

  test("rejects domains whose mail servers are all private", async () => {
    const { attempts, deps } = createDeps({
      resolveMx: async () => [{ exchange: "internal.target.com", priority: 1 }],
      resolveAddresses: async () => ["127.0.0.1"],
    });

    const result = await deliverMail(
      config,
      envelope(["victim@target.com"]),
      deps,
    );

    expect(attempts).toHaveLength(0);
    expect(result.rejected).toEqual([
      {
        address: "victim@target.com",
        error: "internal.target.com has no public address",
      },
    ]);
  });

  test("sends external recipients through the relay when configured", async () => {
    const { attempts, deps } = createDeps();
    await deliverMail(
      {
        ...config,
        relay: {
          name: "Relay",
          host: "smtp.relay.com",
          port: 587,
          secure: false,
          auth: { user: "u", pass: "p" },
        },
      },
      envelope(["a@one.com", "b@two.com"]),
      deps,
    );

    expect(attempts).toMatchObject([
      {
        host: "smtp.relay.com",
        port: 587,
        tls: "starttls",
        verifyCertificate: true,
      },
    ]);
  });

  test("names the relay in rejections", async () => {
    const { deps } = createDeps({
      send: async (_options, mail) => ({
        accepted: [],
        rejected: mail.to.map((address) => ({
          address,
          error: "550 sender not verified",
        })),
      }),
    });

    const result = await deliverMail(
      {
        ...config,
        relay: {
          name: "SMTP2GO",
          host: "mail.smtp2go.com",
          port: 2525,
          secure: false,
        },
      },
      envelope(["a@one.com"]),
      deps,
    );

    expect(result.rejected).toEqual([
      { address: "a@one.com", error: "SMTP2GO: 550 sender not verified" },
    ]);
  });
});
