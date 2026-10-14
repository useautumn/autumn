/** Where two values first differ: the path to the field, and each side's value there. */
export type StructuralDifference = {
	path: string;
	left: unknown;
	right: unknown;
};

const definedKeysOf = (value: object): string[] =>
	Object.entries(value).flatMap(([key, field]) =>
		field === undefined ? [] : [key],
	);

const pathTo = ({ path, key }: { path: string; key: string | number }) =>
	typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key;

/** The first place two values differ, whatever their key order; an undefined field counts as absent, as it is once through JSON. Null when equal. */
export const findStructuralDifference = ({
	left,
	right,
	path = "",
}: {
	left: unknown;
	right: unknown;
	path?: string;
}): StructuralDifference | null => {
	if (left === right) return null;
	const isObject = (value: unknown): value is object =>
		typeof value === "object" && value !== null;
	if (
		!isObject(left) ||
		!isObject(right) ||
		Array.isArray(left) !== Array.isArray(right)
	)
		return { path, left, right };
	if (Array.isArray(left) && Array.isArray(right)) {
		if (left.length !== right.length)
			return {
				path: pathTo({ path, key: "length" }),
				left: left.length,
				right: right.length,
			};
		for (const [index, item] of left.entries()) {
			const difference = findStructuralDifference({
				left: item,
				right: right[index],
				path: pathTo({ path, key: index }),
			});
			if (difference) return difference;
		}
		return null;
	}
	const keys = new Set([...definedKeysOf(left), ...definedKeysOf(right)]);
	for (const key of [...keys].sort()) {
		const difference = findStructuralDifference({
			left: Reflect.get(left, key),
			right: Reflect.get(right, key),
			path: pathTo({ path, key }),
		});
		if (difference) return difference;
	}
	return null;
};
