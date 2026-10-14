type RowsCache = Map<string, unknown>;

const cachesByView = new WeakMap<object, RowsCache>();

export const fullSubjectRowsMemoStats = { builds: 0, hits: 0 };

export const markFullSubjectImmutable = <Subject extends object>({
	fullSubject,
}: {
	fullSubject: Subject;
}): Subject => {
	if (!cachesByView.has(fullSubject)) cachesByView.set(fullSubject, new Map());
	return fullSubject;
};

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
