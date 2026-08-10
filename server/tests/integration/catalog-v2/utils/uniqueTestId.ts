/** Per-invocation unique id so concurrent catalog-v2 tests don't share rows. */
export const uniqueTestId = (prefix: string) =>
	`${prefix}_${Math.random().toString(36).slice(2, 9)}`;
