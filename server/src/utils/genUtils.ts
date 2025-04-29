import { format } from "date-fns";
import KSUID from "ksuid";
import RecaseError from "./errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";

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
      console.log("Key", key);
      console.log("Obj1", obj1[key]);
      console.log("Obj2", obj2[key]);
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

export const formatUnixToDate = (unixDate?: number) => {
  if (!unixDate) {
    return null;
  }
  return format(new Date(unixDate), "d MMM yyyy");
};

export const timeout = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const validateId = (type: string, id: string) => {
  if (!id.match(/^[a-zA-Z0-9_-]+$/)) {
    throw new RecaseError({
      message: `${type} ID can only contain alphanumeric characters, underscores, and hyphens`,
      code: ErrCode.InvalidId,
      statusCode: 400,
    });
  }
};
