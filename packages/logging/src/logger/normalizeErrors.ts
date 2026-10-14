const MAX_DEPTH = 5;

const UNCHANGED = Symbol("unchanged");

const rewriteAppPath = (value: string): string =>
	value.replace("file:///app/", "./").replace(/\/app\//g, "./");

export const errorToObject = (
	error: Error,
	depth = 0,
): Record<string, unknown> => ({
	name: error.name,
	message: error.message,
	stack: error.stack ? rewriteAppPath(error.stack) : undefined,
	...(error.cause === undefined || depth >= MAX_DEPTH
		? {}
		: { cause: normalizeCause(error.cause, depth + 1) }),
});

const normalizeCause = (cause: unknown, depth: number): unknown => {
	if (cause instanceof Error) return errorToObject(cause, depth);
	const result = normalize(cause, depth);
	return result === UNCHANGED ? cause : result;
};

const isPlainObject = (value: object) => {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

const opaqueInstanceToString = (value: object) => {
	if (typeof (value as { toJSON?: unknown }).toJSON === "function") return;
	return Object.keys(value).length === 0 ? String(value) : undefined;
};

const normalize = (
	value: unknown,
	depth: number,
): unknown | typeof UNCHANGED => {
	if (value instanceof Error) return errorToObject(value, depth);
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

export const normalizeErrorValues = (value: unknown): unknown => {
	const result = normalize(value, 0);
	return result === UNCHANGED ? value : result;
};

export { rewriteAppPath };
