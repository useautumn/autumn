/** Freezing walks the whole object, a large share of a push's CPU on a big subject, so only tests pay it. */
const FREEZES = process.env.NODE_ENV === "test";

/** Frozen under test, because later checks share the same copy: a mutation there throws instead of changing another check's answer. */
export const deepFreeze = <T>(value: T): T => {
	if (
		!FREEZES ||
		typeof value !== "object" ||
		value === null ||
		Object.isFrozen(value)
	)
		return value;
	Object.freeze(value);
	for (const child of Object.values(value)) deepFreeze(child);
	return value;
};
