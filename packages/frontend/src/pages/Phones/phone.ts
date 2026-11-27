import dayjs from "dayjs";
import type { PhoneWake } from "shared";

export const formatPhoneNumber = (number: string) => {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(number);
  return match === null ? number : `+1 (${match[1]}) ${match[2]}-${match[3]}`;
};

export const formatWakeWindow = (
  { scheduled, usageWindowStart: start, usageWindowEnd: end }: PhoneWake,
  now = Date.now(),
) => {
  if (!scheduled || end === undefined || end <= now) return undefined;
  return start === undefined || start <= now
    ? `Awake until ${dayjs(end).format("HH:mm")}`
    : `Awake ${dayjs(start).format("HH:mm")}–${dayjs(end).format("HH:mm")}`;
};
