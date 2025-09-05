import { format } from "date-fns";
type TimeCase = "upper" | "lower";
export const formatDateStr = (date: Date | string) => {
  return format(new Date(date), "dd MMM yyyy");
};

export const formatTimestamp = (timestamp: number | null | undefined) => {
  if (!timestamp) return "";
  return format(new Date(timestamp), "MM/dd/yyyy");
};

export const formatUnixToDate = (
  unix: number | null | undefined,
  excludeYear = false,
) => {
  if (!unix) return "";
  return format(new Date(unix), excludeYear ? "d MMM" : "d MMM yyyy");
};

export const formatUnixToDateTime = (unix: number | null | undefined,
  options?: { ampm?: boolean; case?: TimeCase }) => {
  if (!unix) return { date: "", time: "" };
  const date = format(new Date(unix), "d MMM");

  const pattern = options?.ampm ? "HH:mm a" : "HH:mm";
  let time = format(new Date(unix), pattern);

  if (options?.case === "lower") time = time.toLowerCase();
  if (options?.case === "upper") time = time.toUpperCase();

  return { date, time };
};

export const formatUnixToDateTimeWithMs = (unix: number | null | undefined) => {
  if (!unix) return "";
  const date = format(new Date(unix), "d MMM");
  const time = format(new Date(unix), "HH:mm:ss.SSS");
  return `${date} ${time}`;
};

export const formatUnixToDateTimeString = (unix: number | null | undefined) => {
  if (!unix) return "";
  const { date, time } = formatUnixToDateTime(unix);
  return `${date} ${time}`;
};
