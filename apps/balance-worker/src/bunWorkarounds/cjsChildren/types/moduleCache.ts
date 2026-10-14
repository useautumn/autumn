/** `require.cache`: one entry per loaded CommonJS module, keyed by filename. */
export type ModuleCache = Record<string, { children?: unknown } | undefined>;
