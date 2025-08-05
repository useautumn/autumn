function stringToSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export const toSnakeCase = (obj: any, excludeKeys?: string[]): any => {
  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item, excludeKeys));
  } else if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => {
        const snakeKey = stringToSnakeCase(key);

        // If this key should be excluded, convert the key but keep the value as-is
        if (excludeKeys && excludeKeys.includes(key)) {
          return [snakeKey, value];
        }

        // Otherwise, convert both key and recursively process the value
        return [snakeKey, toSnakeCase(value, excludeKeys)];
      })
    );
  }
  return obj;
};
