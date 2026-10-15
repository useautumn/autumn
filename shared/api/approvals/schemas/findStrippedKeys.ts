import { isPlainObject } from "./isPlainObject";

type Path = (string | number)[];

/**
 * Paths of input keys the parse dropped. Filter schemas strip unknown keys, and
 * unions fall through to a branch that strips a bad value, so a typo or a bad
 * operator would otherwise turn a condition into "always".
 */
export const findStrippedKeys = ({
	input,
	output,
	path = [],
}: {
	input: unknown;
	output: unknown;
	path?: Path;
}): Path[] => {
	if (Array.isArray(input) && Array.isArray(output)) {
		return input.flatMap((item, index) =>
			findStrippedKeys({
				input: item,
				output: output[index],
				path: [...path, index],
			}),
		);
	}
	if (!isPlainObject(input) || !isPlainObject(output)) return [];

	return Object.entries(input).flatMap(([key, value]) =>
		key in output
			? findStrippedKeys({
					input: value,
					output: output[key],
					path: [...path, key],
				})
			: [[...path, key]],
	);
};
