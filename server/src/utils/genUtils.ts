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
    if (nullish(obj1[key]) && nullish(obj2[key])) {
      continue;
    }

    if (nullish(obj1[key]) || nullish(obj2[key])) {
      return false;
    }

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

export const formatUnixToDateTime = (unixDate?: number | null) => {
  if (!unixDate) {
    return "undefined unix date";
  }
  return format(new Date(unixDate), "dd MMM yyyy HH:mm:ss");
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

function stringToSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export const toSnakeCase = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  } else if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        stringToSnakeCase(key),
        toSnakeCase(value),
      ]),
    );
  }
  return obj;
};
