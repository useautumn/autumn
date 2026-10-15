/** Rule id keys a rename can move; both are public ids referenced by value. */
export type RenamableIdKey = "plan_id" | "feature_id";

const ID_MATCHER_KEYS = new Set(["$eq", "$ne", "$in", "$nin"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const renameId = ({
	value,
	fromId,
	toId,
}: {
	value: unknown;
	fromId: string;
	toId: string;
}): unknown => {
	if (value === fromId) return toId;
	if (Array.isArray(value))
		return value.map((item) => (item === fromId ? toId : item));
	return value;
};

/** An id key holds a bare id or an IdMatcher (`$eq`/`$ne`/`$in`/`$nin`). */
const renameIdMatcher = ({
	matcher,
	fromId,
	toId,
}: {
	matcher: unknown;
	fromId: string;
	toId: string;
}): unknown => {
	if (!isRecord(matcher)) return renameId({ value: matcher, fromId, toId });

	return Object.fromEntries(
		Object.entries(matcher).map(([op, value]) => [
			op,
			ID_MATCHER_KEYS.has(op) ? renameId({ value, fromId, toId }) : value,
		]),
	);
};

/** A copy of `when` with every `key` reference to `fromId` moved to `toId`, at any depth. */
export const rewriteWhenIds = ({
	when,
	key,
	fromId,
	toId,
}: {
	when: unknown;
	key: RenamableIdKey;
	fromId: string;
	toId: string;
}): unknown => {
	if (Array.isArray(when)) {
		return when.map((item) =>
			rewriteWhenIds({ when: item, key, fromId, toId }),
		);
	}
	if (!isRecord(when)) return when;

	return Object.fromEntries(
		Object.entries(when).map(([field, value]) => [
			field,
			field === key
				? renameIdMatcher({ matcher: value, fromId, toId })
				: rewriteWhenIds({ when: value, key, fromId, toId }),
		]),
	);
};
