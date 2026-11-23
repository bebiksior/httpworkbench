import { describe, expect, test } from "vitest";
import { parseSmtpLogPreview, splitSmtpLog } from "./smtpLogMessage";

const envelope = [
  "CLIENT: 198.51.100.10",
  "EHLO: mailer.test",
  "MAIL FROM: <a@example.test>",
  "RCPT TO: <b@abc.instances.example.test>",
  "SIZE: 100 bytes",
  "ZONE: instances.example.test",
].join("\n");

describe("splitSmtpLog", () => {
  test("splits the envelope from the message", () => {
    expect(splitSmtpLog(`${envelope}\n\nSubject: hi\r\n\r\nbody`)).toEqual({
      envelope: `${envelope}\n\n`,
      message: "Subject: hi\r\n\r\nbody",
    });
  });

  test("treats the whole value as the message without an envelope", () => {
    expect(splitSmtpLog("body")).toEqual({ envelope: "", message: "body" });
  });
});

describe("parseSmtpLogPreview", () => {
  test("extracts the HTML part of a multipart message", async () => {
    const message = [
      "Subject: hi",
      'Content-Type: multipart/alternative; boundary="b"',
      "",
      "--b",
      "Content-Type: text/plain",
      "",
      "plain body",
      "--b",
      "Content-Type: text/html",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      '<p class=3D"x">html body</p>',
      "--b--",
      "",
    ].join("\r\n");

    const preview = await parseSmtpLogPreview(`${envelope}\n\n${message}`);

    expect(preview.html).toContain('<p class="x">html body</p>');
    expect(preview.text).toContain("plain body");
  });

  test("leaves html undefined for plain text messages", async () => {
    const preview = await parseSmtpLogPreview(
      `${envelope}\n\nSubject: hi\r\n\r\njust text\r\n`,
    );

    expect(preview.html).toBeUndefined();
    expect(preview.text).toContain("just text");
  });
});
