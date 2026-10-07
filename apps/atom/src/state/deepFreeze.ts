/** Frozen, because later checks share the same copy: a mutation throws instead of changing another check's answer. */
export const deepFreeze = <T>(value: T): T => {
	if (typeof value !== "object" || value === null || Object.isFrozen(value))
		return value;
	Object.freeze(value);
	for (const child of Object.values(value)) deepFreeze(child);
	return value;
};
