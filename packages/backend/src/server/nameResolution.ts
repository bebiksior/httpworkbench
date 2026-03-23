export type InstanceNameResolution =
  | {
      kind: "zone";
    }
  | {
      kind: "instance";
      instanceId: string;
    }
  | {
      kind: "out_of_zone";
    }
  | {
      kind: "missing_instance";
    };

export const normalizeHostname = (value: string): string => {
  const trimmed = value.trim().toLowerCase();

  if (trimmed.startsWith("[")) {
    const bracketMatch = trimmed.match(/^\[(.*)\](?::\d+)?$/);
    return (bracketMatch?.[1] ?? trimmed).replace(/\.+$/, "");
  }

  return trimmed.replace(/:\d+$/, "").replace(/\.+$/, "");
};

export const resolveInstanceName = (
  name: string,
  zone: string,
): InstanceNameResolution => {
  const normalizedName = normalizeHostname(name);
  const normalizedZone = normalizeHostname(zone);

  if (normalizedName === normalizedZone) {
    return { kind: "zone" };
  }

  const suffix = `.${normalizedZone}`;
  if (!normalizedName.endsWith(suffix)) {
    return { kind: "out_of_zone" };
  }

  const prefix = normalizedName.slice(0, -suffix.length);
  if (prefix === "") {
    return { kind: "missing_instance" };
  }

  const parts = prefix.split(".").filter((part) => part !== "");
  const instanceId = parts[parts.length - 1];
  if (instanceId === undefined || instanceId === "") {
    return { kind: "missing_instance" };
  }

  return {
    kind: "instance",
    instanceId,
  };
};
