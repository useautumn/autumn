type RowsCache = Map<string, unknown>;

/** Kept off the view itself: a defined property would change the object's shape and slow every read of it. */
const cachesByView = new WeakMap<object, RowsCache>();

/** How often selections were served from a kept flatten and how often one was built; read by benches and tests. */
export const fullSubjectRowsMemoStats = { builds: 0, hits: 0 };

/**
 * Marks a view as one that is replaced, never edited in place, so the row
 * selections built over it may be kept for it. A spread copy of the view is a
 * different object and carries no mark, so it is flattened afresh.
 */
export const markFullSubjectImmutable = <Subject extends object>({
	fullSubject,
}: {
	fullSubject: Subject;
}): Subject => {
	if (!cachesByView.has(fullSubject)) cachesByView.set(fullSubject, new Map());
	return fullSubject;
};

/** `build` once per marked view and key; every time on an unmarked view, whose rows may change under it. */
export const memoOnFullSubject = <Value>({
	fullSubject,
	key,
	build,
}: {
	fullSubject: object;
	key: string;
	build: () => Value;
}): Value => {
	const cache = cachesByView.get(fullSubject);
	if (!cache) return build();
	if (cache.has(key)) {
		fullSubjectRowsMemoStats.hits += 1;
		return cache.get(key) as Value;
	}
	fullSubjectRowsMemoStats.builds += 1;
	const value = build();
	cache.set(key, value);
	return value;
};
