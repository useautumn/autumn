/** Replaced at build time by bun.config.ts; falls back when run from source. */
declare const VERSION: string | undefined;

export const version: string =
	typeof VERSION === "string" ? VERSION : "0.0.0-dev";
