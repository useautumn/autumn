const replicaSourced = new WeakSet<object>();

declare const primarySourcedBrand: unique symbol;
/** Compile-time proof a subject was hydrated from the primary (or cache). */
export type PrimarySourced<T> = T & { readonly [primarySourcedBrand]: true };

/** Called only by the chokepoint when a replica served the hydration.
 *  WeakSet, not a property: nothing serializes, nothing survives clone. */
export const markReplicaSourced = <T extends object>(value: T): T => {
	replicaSourced.add(value);
	return value;
};

export const isReplicaSourced = (value: object): boolean =>
	replicaSourced.has(value);

/** Runtime guard at the cache writer — throws if a caller launders the type. */
export const assertPrimarySourced = <T extends object>(
	value: T,
	context: string,
): PrimarySourced<T> => {
	if (replicaSourced.has(value)) {
		throw new Error(
			`[subjectProvenance] ${context}: replica-sourced FullSubject must never be written to the Redis cache`,
		);
	}
	return value as PrimarySourced<T>;
};
