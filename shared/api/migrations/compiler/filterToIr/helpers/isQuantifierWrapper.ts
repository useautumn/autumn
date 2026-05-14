export function isQuantifierWrapper(
	raw: unknown,
): raw is { $some?: unknown; $every?: unknown; $none?: unknown } {
	if (!raw || typeof raw !== "object") return false;
	const keys = Object.keys(raw as object);
	return keys.some((k) => k === "$some" || k === "$every" || k === "$none");
}
