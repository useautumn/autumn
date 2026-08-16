type EnvMap = Record<string, string | undefined>;

const isTruthy = (value: string | undefined): boolean =>
	value === "1" || value === "true";

export const DEV_PATH_PREFIXES = {
	backend: "/backend",
	checkout: "/checkout",
	dashboard: "/dashboard",
	leaf: "/leaf",
} as const;

export type DevPathName = keyof typeof DEV_PATH_PREFIXES;

export const isDwHeadless = (env: EnvMap = process.env): boolean =>
	isTruthy(env.DW_HEADLESS);

export const usesPathProxy = (env: EnvMap = process.env): boolean =>
	isDwHeadless(env) || isTruthy(env.DW_PATH_PROXY);

const CROSS_APP_PATHS = [
	DEV_PATH_PREFIXES.backend,
	DEV_PATH_PREFIXES.checkout,
	DEV_PATH_PREFIXES.leaf,
] as const;

/** Paths that belong to another service on the shared hostname. */
export const isCrossAppDevPath = (path: string): boolean =>
	CROSS_APP_PATHS.some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);
