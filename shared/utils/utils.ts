/** biome-ignore-all lint/suspicious/noExplicitAny: one off */

export const notNullish = (value: any) => value !== null && value !== undefined;
export const nullish = (value: any) => value === null || value === undefined;
