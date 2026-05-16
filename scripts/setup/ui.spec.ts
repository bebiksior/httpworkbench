import { beforeEach, describe, expect, test, vi } from "vitest";

const { textMock } = vi.hoisted(() => {
  return {
    textMock: vi.fn(),
  };
});

vi.mock("@clack/prompts", () => {
  return {
    cancel: vi.fn(),
    confirm: vi.fn(),
    intro: vi.fn(),
    isCancel: vi.fn(() => false),
    log: {},
    note: vi.fn(),
    outro: vi.fn(),
    password: vi.fn(),
    select: vi.fn(),
    spinner: vi.fn(),
    text: textMock,
  };
});

import { promptText } from "./ui";

describe("setup UI helpers", () => {
  beforeEach(() => {
    textMock.mockReset();
  });

  test("shows default text values as the initial prompt value", async () => {
    textMock.mockResolvedValue("203.0.113.10");

    await promptText({
      message: "What is the public IPv4 of this server?",
      defaultValue: "203.0.113.10",
    });

    expect(textMock).toHaveBeenCalledWith({
      message: "What is the public IPv4 of this server?",
      defaultValue: "203.0.113.10",
      initialValue: "203.0.113.10",
    });
  });

  test("keeps an explicit initial value when one is provided", async () => {
    textMock.mockResolvedValue("example.com");

    await promptText({
      message: "What domain should host HTTP Workbench?",
      defaultValue: "saved.example.com",
      initialValue: "typed.example.com",
    });

    expect(textMock).toHaveBeenCalledWith({
      message: "What domain should host HTTP Workbench?",
      defaultValue: "saved.example.com",
      initialValue: "typed.example.com",
    });
  });
});
