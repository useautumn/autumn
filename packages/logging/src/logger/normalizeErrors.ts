const MAX_DEPTH = 5;

const UNCHANGED = Symbol("unchanged");

const rewriteAppPath = (value: string): string =>
	value.replace("file:///app/", "./").replace(/\/app\//g, "./");

export const errorToObject = (error: Error) => ({
	name: error.name,
	message: error.message,
	stack: error.stack ? rewriteAppPath(error.stack) : undefined,
});

const isPlainObject = (value: object) => {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/** Class instances without enumerable keys or toJSON stringify to `{}` —
 * String(value) at least preserves "[object Response]"-style identity. */
const opaqueInstanceToString = (value: object) => {
	if (typeof (value as { toJSON?: unknown }).toJSON === "function") return;
	return Object.keys(value).length === 0 ? String(value) : undefined;
};

const normalize = (
	value: unknown,
	depth: number,
): unknown | typeof UNCHANGED => {
	if (value instanceof Error) return errorToObject(value);
	if (!value || typeof value !== "object" || depth >= MAX_DEPTH) {
		return UNCHANGED;
	}
	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((item) => {
			const result = normalize(item, depth + 1);
			if (result === UNCHANGED) return item;
			changed = true;
			return result;
		});
		return changed ? next : UNCHANGED;
	}
	if (!isPlainObject(value)) return opaqueInstanceToString(value) ?? UNCHANGED;
	let changed = false;
	const next = Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, item]) => {
			const result = normalize(item, depth + 1);
			if (result === UNCHANGED) return [key, item];
			changed = true;
			return [key, result];
		}),
	);
	return changed ? next : UNCHANGED;
};

/** Errors nested in payload objects JSON-serialize to `{}` (their props are
 * non-enumerable), so rewrite them to plain objects before pino sees them. */
export const normalizeErrorValues = (value: unknown): unknown => {
	const result = normalize(value, 0);
	return result === UNCHANGED ? value : result;
};

export { rewriteAppPath };
