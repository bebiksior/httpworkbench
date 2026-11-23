import { describe, expect, test } from "vitest";
import { decodeSmtpLog } from "./decodeMime";

const envelope = "CLIENT: 198.51.100.10\nMAIL FROM: <qp=40example.test>\n\n";

describe("decodeSmtpLog", () => {
  test("decodes quoted-printable bodies and keeps the envelope raw", () => {
    const message = [
      "Subject: hi",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "hello=20world=0D=0Aagain",
    ].join("\r\n");

    expect(decodeSmtpLog(`${envelope}${message}`)).toBe(
      `${envelope}Subject: hi\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nhello world\r\nagain`,
    );
  });

  test("leaves bodies without a transfer encoding untouched", () => {
    const message = "Subject: hi\r\n\r\nhttps://a.test/?x=3D1\r\n";

    expect(decodeSmtpLog(`${envelope}${message}`)).toBe(
      `${envelope}${message}`,
    );
  });

  test("keeps multipart boundaries that end in = intact", () => {
    const boundary = "===============123==";
    const message = [
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "caf=C3=A9",
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      "PHA+aGk8L3A+",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    expect(decodeSmtpLog(`${envelope}${message}`)).toBe(
      envelope +
        [
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          "Content-Type: text/plain",
          "Content-Transfer-Encoding: quoted-printable",
          "",
          "café",
          `--${boundary}`,
          "Content-Type: text/html; charset=utf-8",
          "Content-Transfer-Encoding: base64",
          "",
          "<p>hi</p>",
          `--${boundary}--`,
          "",
        ].join("\r\n"),
    );
  });

  test("leaves binary base64 attachments encoded", () => {
    const message = [
      'Content-Type: multipart/mixed; boundary="b"',
      "",
      "--b",
      "Content-Type: image/png",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
      "--b--",
    ].join("\r\n");

    expect(decodeSmtpLog(`${envelope}${message}`)).toBe(
      `${envelope}${message}`,
    );
  });

  test("decodes encoded-word headers", () => {
    const message =
      "Subject: =?utf-8?B?Q2Fmw6k=?= =?ISO-8859-1?Q?_na=EFve?=\r\n\r\nbody";

    expect(decodeSmtpLog(`${envelope}${message}`)).toBe(
      `${envelope}Subject: Café naïve\r\n\r\nbody`,
    );
  });
});
