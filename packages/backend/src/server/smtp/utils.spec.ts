import { describe, expect, test } from "bun:test";
import {
  formatSmtpLogRaw,
  maxSmtpDataBytes,
  parsePathAddress,
  parseSizeParam,
  parseSmtpCommand,
  resolveRcptInstance,
  unstuffDataDot,
} from "./utils";

describe("parseSmtpCommand", () => {
  test("splits the verb and the remainder", () => {
    expect(parseSmtpCommand("MAIL FROM:<a@b>")).toEqual({
      verb: "MAIL",
      rest: "FROM:<a@b>",
    });
  });

  test("uppercases the verb and tolerates a missing argument", () => {
    expect(parseSmtpCommand("quit")).toEqual({ verb: "QUIT", rest: "" });
  });
});

describe("parsePathAddress", () => {
  test("extracts the angle address for MAIL FROM", () => {
    expect(parsePathAddress("FROM:<attacker@evil.test>", "FROM")).toBe(
      "attacker@evil.test",
    );
  });

  test("accepts the null sender", () => {
    expect(parsePathAddress("FROM:<>", "FROM")).toBe("");
  });

  test("ignores trailing esmtp parameters", () => {
    expect(parsePathAddress("FROM:<a@b> SIZE=10 BODY=8BITMIME", "FROM")).toBe(
      "a@b",
    );
  });

  test("tolerates a space after the colon and missing brackets", () => {
    expect(parsePathAddress("TO: poc@x.instances.example.com", "TO")).toBe(
      "poc@x.instances.example.com",
    );
  });

  test("returns undefined when the keyword does not match", () => {
    expect(parsePathAddress("TO:<a@b>", "FROM")).toBeUndefined();
  });
});

describe("parseSizeParam", () => {
  test("reads the SIZE parameter", () => {
    expect(parseSizeParam("FROM:<a@b> SIZE=2048")).toBe(2048);
  });

  test("returns undefined when absent", () => {
    expect(parseSizeParam("FROM:<a@b>")).toBeUndefined();
  });
});

describe("unstuffDataDot", () => {
  test("removes a single leading dot", () => {
    expect(unstuffDataDot("..leading")).toBe(".leading");
  });

  test("leaves non-dotted lines untouched", () => {
    expect(unstuffDataDot("Subject: hi")).toBe("Subject: hi");
  });
});

describe("resolveRcptInstance", () => {
  test("resolves the instance id from the recipient domain", () => {
    expect(
      resolveRcptInstance(
        "poc@abc.instances.example.com",
        "instances.example.com",
      ),
    ).toEqual({ kind: "instance", instanceId: "abc" });
  });

  test("uses the last label before the zone", () => {
    expect(
      resolveRcptInstance(
        "poc@deep.abc.instances.example.com",
        "instances.example.com",
      ),
    ).toEqual({ kind: "instance", instanceId: "abc" });
  });

  test("flags out-of-zone recipients", () => {
    expect(
      resolveRcptInstance("poc@elsewhere.example.com", "instances.example.com"),
    ).toEqual({ kind: "out_of_zone" });
  });

  test("treats an address without a domain as out of zone", () => {
    expect(resolveRcptInstance("poc", "instances.example.com")).toEqual({
      kind: "out_of_zone",
    });
  });

  test("recognizes the zone apex", () => {
    expect(
      resolveRcptInstance(
        "postmaster@instances.example.com",
        "instances.example.com",
      ),
    ).toEqual({ kind: "zone" });
  });
});

describe("formatSmtpLogRaw", () => {
  test("captures the envelope and message", () => {
    const raw = formatSmtpLogRaw({
      clientAddress: "198.51.100.23",
      ehloName: "evil.test",
      mailFrom: "attacker@evil.test",
      rcptTo: "poc@abc.instances.example.com",
      sizeBytes: 12,
      truncated: false,
      instancesDomain: "instances.example.com",
      message: "Subject: hi\r\n\r\nhello\r\n",
    });

    expect(raw).toContain("CLIENT: 198.51.100.23");
    expect(raw).toContain("EHLO: evil.test");
    expect(raw).toContain("MAIL FROM: <attacker@evil.test>");
    expect(raw).toContain("RCPT TO: <poc@abc.instances.example.com>");
    expect(raw).toContain("ZONE: instances.example.com");
    expect(raw).toContain("\n\nSubject: hi");
  });

  test("renders the null sender and marks truncated captures", () => {
    const raw = formatSmtpLogRaw({
      clientAddress: "198.51.100.23",
      ehloName: undefined,
      mailFrom: "",
      rcptTo: "poc@abc.instances.example.com",
      sizeBytes: maxSmtpDataBytes,
      truncated: true,
      instancesDomain: "instances.example.com",
      message: "partial",
    });

    expect(raw).toContain("MAIL FROM: <>");
    expect(raw).toContain("[truncated");
  });
});
