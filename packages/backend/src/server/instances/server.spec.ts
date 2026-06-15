import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

const addLogMock = mock();
const broadcastLogMock = mock();
const getInstanceByIdMock = mock();
const listenMock = mock();
const parseMock = mock();

mock.module("http-z", () => ({
  parse: parseMock,
}));

mock.module("../../config", () => ({
  dnsConfig: {
    instancesDomain: "instances.example.com",
  },
}));

mock.module("../../storage", () => ({
  addLog: addLogMock,
}));

mock.module("../../storage/repositories/instances", () => ({
  getInstanceById: getInstanceByIdMock,
}));

mock.module("./logStream", () => ({
  broadcastLog: broadcastLogMock,
}));

const { createInstancesServer } = await import("./server");

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);

const createRawRequest = (headers: string[], body = "") => {
  return ["GET / HTTP/1.1", ...headers, "", body].join("\r\n");
};

const createStaticInstance = (raw: string) => ({
  id: "demo",
  kind: "static" as const,
  ownerId: "user-1",
  createdAt: 1,
  raw,
  webhookIds: [],
  public: false,
  locked: false,
});

const createSocket = () => ({
  data: undefined as { buffer: unknown } | undefined,
  end: mock(),
  remoteAddress: "198.51.100.10",
  timeout: mock(),
  write: mock(),
});

type ServerHandlers = {
  open: (socket: ReturnType<typeof createSocket>) => void;
  data: (
    socket: ReturnType<typeof createSocket>,
    data: Uint8Array,
  ) => Promise<void>;
};

describe("createInstancesServer", () => {
  let handlers: ServerHandlers;

  beforeEach(() => {
    mock.clearAllMocks();
    spyOn(console, "error").mockImplementation(() => undefined);
    spyOn(console, "log").mockImplementation(() => undefined);

    listenMock.mockReturnValue({
      stop: mock(),
    });

    createInstancesServer(8082, listenMock);

    const options = listenMock.mock.calls[0]?.[0] as
      | { socket: ServerHandlers }
      | undefined;
    if (options === undefined) {
      throw new Error("listen was not called");
    }
    handlers = options.socket;
  });

  afterEach(() => {
    mock.restore();
  });

  test("configures a timeout when a socket opens", () => {
    const socket = createSocket();

    handlers.open(socket);

    expect(socket.timeout).toHaveBeenCalledWith(30);
    expect(socket.data).toBeDefined();
  });

  test("returns a bad request response when the host header is missing", async () => {
    parseMock.mockReturnValue({
      headers: [],
    });
    const socket = createSocket();

    handlers.open(socket);
    await handlers.data(socket, encode(createRawRequest([])));

    expect(getInstanceByIdMock).not.toHaveBeenCalled();
    expect(decode(socket.write.mock.calls[0]?.[0])).toContain(
      "400 Bad Request",
    );
    expect(decode(socket.write.mock.calls[0]?.[0])).toContain(
      "Missing Host header",
    );
    expect(addLogMock).not.toHaveBeenCalled();
    expect(broadcastLogMock).not.toHaveBeenCalled();
    expect(socket.end).toHaveBeenCalledTimes(1);
  });

  test("logs oversized requests when they can be attributed to an instance", async () => {
    getInstanceByIdMock.mockReturnValue(
      createStaticInstance("HTTP/1.1 200 OK\r\n\r\nok"),
    );
    const socket = createSocket();

    handlers.open(socket);
    await handlers.data(
      socket,
      encode(
        createRawRequest([
          "Host: demo.instances.example.com",
          `Content-Length: ${32 * 1024 * 1024 + 1}`,
          "X-Internal-Real-IP: 203.0.113.42",
        ]),
      ),
    );

    expect(addLogMock).toHaveBeenCalledTimes(1);
    expect(addLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "203.0.113.42",
        instanceId: "demo",
        raw: [
          "GET / HTTP/1.1",
          "Host: demo.instances.example.com",
          `Content-Length: ${32 * 1024 * 1024 + 1}`,
          "",
          "",
        ].join("\r\n"),
      }),
    );
    expect(broadcastLogMock).toHaveBeenCalledWith(
      addLogMock.mock.calls[0]?.[0],
    );
    expect(decode(socket.write.mock.calls[0]?.[0])).toContain("Body too large");
  });

  test("logs sanitized requests and writes large static responses", async () => {
    const body = "a".repeat(1024 * 1024);
    parseMock.mockReturnValue({
      headers: [
        {
          name: "Host",
          value: "demo.instances.example.com",
        },
        {
          name: "X-Internal-Real-IP",
          value: "203.0.113.42",
        },
      ],
    });
    getInstanceByIdMock.mockReturnValue(
      createStaticInstance(
        [
          "HTTP/1.1 200 OK",
          "Content-Type: text/plain",
          "Content-Length: 0",
          "",
          body,
        ].join("\r\n"),
      ),
    );
    const socket = createSocket();

    handlers.open(socket);
    await handlers.data(
      socket,
      encode(
        createRawRequest([
          "Host: demo.instances.example.com",
          "X-Internal-Real-IP: 203.0.113.42",
        ]),
      ),
    );

    expect(addLogMock).toHaveBeenCalledTimes(1);
    expect(addLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "203.0.113.42",
        instanceId: "demo",
        raw: "GET / HTTP/1.1\r\nHost: demo.instances.example.com\r\n\r\n",
        type: "http",
      }),
    );
    expect(broadcastLogMock).toHaveBeenCalledWith(
      addLogMock.mock.calls[0]?.[0],
    );

    const rawResponse = decode(socket.write.mock.calls[0]?.[0]);
    expect(rawResponse).toContain(`Content-Length: ${body.length}`);
    expect(rawResponse.endsWith(body)).toBe(true);
    expect(socket.end).toHaveBeenCalledTimes(1);
  });

  test("returns a bad request response when the instance does not exist", async () => {
    parseMock.mockReturnValue({
      headers: [
        {
          name: "Host",
          value: "missing.instances.example.com",
        },
      ],
    });
    getInstanceByIdMock.mockReturnValue(undefined);
    const socket = createSocket();

    handlers.open(socket);
    await handlers.data(
      socket,
      encode(createRawRequest(["Host: missing.instances.example.com"])),
    );

    expect(addLogMock).not.toHaveBeenCalled();
    expect(broadcastLogMock).not.toHaveBeenCalled();
    expect(decode(socket.write.mock.calls[0]?.[0])).toContain(
      "Instance not found",
    );
  });

  test("returns an internal server error when request parsing throws", async () => {
    getInstanceByIdMock.mockReturnValue(
      createStaticInstance("HTTP/1.1 200 OK\r\n\r\nok"),
    );
    parseMock.mockImplementation(() => {
      throw new Error("parse failed");
    });
    const socket = createSocket();

    handlers.open(socket);
    await handlers.data(
      socket,
      encode(createRawRequest(["Host: demo.instances.example.com"])),
    );

    expect(addLogMock).toHaveBeenCalledTimes(1);
    expect(broadcastLogMock).toHaveBeenCalledWith(
      addLogMock.mock.calls[0]?.[0],
    );
    expect(console.error).toHaveBeenCalled();
    expect(decode(socket.write.mock.calls[0]?.[0])).toContain(
      "500 Internal Server Error",
    );
  });
});
