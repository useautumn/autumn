import { isPlainObject } from "../schemas/isPlainObject";
import type { WhenEntry } from "./types";

/** Every object entry in a `when` filter, at any depth, with its path from `when`. */
export const listWhenEntries = ({
	value,
	path = ["when"],
}: {
	value: unknown;
	path?: (string | number)[];
}): WhenEntry[] => {
	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			listWhenEntries({ value: item, path: [...path, index] }),
		);
	}
	if (!isPlainObject(value)) return [];

	return Object.entries(value).flatMap(([key, child]) => {
		const childPath = [...path, key];
		return [
			{ path: childPath, key, value: child },
			...listWhenEntries({ value: child, path: childPath }),
		];
	});
};
