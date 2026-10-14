const replicaSourced = new WeakSet<object>();

declare const primarySourcedBrand: unique symbol;
export type PrimarySourced<T> = T & { readonly [primarySourcedBrand]: true };

export const markReplicaSourced = <T extends object>(value: T): T => {
	replicaSourced.add(value);
	return value;
};

export const isReplicaSourced = (value: object): boolean =>
	replicaSourced.has(value);

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
