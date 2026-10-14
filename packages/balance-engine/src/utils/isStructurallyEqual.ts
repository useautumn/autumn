const definedKeysOf = (value: object): string[] =>
	Object.entries(value).flatMap(([key, field]) =>
		field === undefined ? [] : [key],
	);

/** Same values, whatever the key order; an undefined field counts as absent, as it is once through JSON. */
export const isStructurallyEqual = (left: unknown, right: unknown): boolean => {
	if (left === right) return true;
	if (typeof left !== "object" || typeof right !== "object") return false;
	if (left === null || right === null) return false;
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right)) return false;
		return (
			left.length === right.length &&
			left.every((item, index) => isStructurallyEqual(item, right[index]))
		);
	}
	const leftKeys = definedKeysOf(left);
	return (
		leftKeys.length === definedKeysOf(right).length &&
		leftKeys.every((key) =>
			isStructurallyEqual(Reflect.get(left, key), Reflect.get(right, key)),
		)
	);
};
