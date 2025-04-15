import { format } from "date-fns";

export const formatTimestamp = (timestamp: number | null | undefined) => {
  if (!timestamp) return "";
  return format(new Date(timestamp), "MM/dd/yyyy");
};

export const formatUnixToDateTime = (unix: number | null | undefined) => {
  if (!unix) return { date: "", time: "" };
  const date = format(new Date(unix), "d MMM");
  const time = format(new Date(unix), "HH:mm");
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
