import dayjs from "dayjs";

export const formatPhoneNumber = (number: string) => {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(number);
  return match === null ? number : `+1 (${match[1]}) ${match[2]}-${match[3]}`;
};

export const formatWakeWindow = (start: number | undefined, end: number) =>
  start === undefined || start <= Date.now()
    ? `Awake until ${dayjs(end).format("HH:mm")}`
    : `Awake ${dayjs(start).format("HH:mm")}–${dayjs(end).format("HH:mm")}`;
