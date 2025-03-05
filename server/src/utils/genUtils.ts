import { format } from "date-fns";
import KSUID from "ksuid";

export const generateId = (prefix: string) => {
  if (!prefix) {
    return KSUID.randomSync().string;
  } else {
    return `${prefix}_${KSUID.randomSync().string}`;
  }
};

export const compareObjects = (obj1: any, obj2: any) => {
  for (const key in obj1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }
  return true;
};

export const keyToTitle = (key: string) => {
  return key
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const notNullOrUndefined = (value: any) => {
  return value !== null && value !== undefined;
};

export const nullOrUndefined = (value: any) => {
  return value === null || value === undefined;
};

export const nullish = (value: any) => {
  return value === null || value === undefined;
};

export const notNullish = (value: any) => {
  return !nullish(value);
};

export const formatUnixToDateTime = (unixDate: number) => {
  return format(new Date(unixDate), "yyyy MMM dd HH:mm:ss");
};
