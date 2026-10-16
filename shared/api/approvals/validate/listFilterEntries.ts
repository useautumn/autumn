import { isPlainObject } from "../schemas/isPlainObject";
import type { FilterEntry } from "./types";

/** Every object entry in a filter, at any depth, with its path from `filter`. */
export const listFilterEntries = ({
	value,
	path = ["filter"],
}: {
	value: unknown;
	path?: (string | number)[];
}): FilterEntry[] => {
	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			listFilterEntries({ value: item, path: [...path, index] }),
		);
	}
	if (!isPlainObject(value)) return [];

	return Object.entries(value).flatMap(([key, child]) => {
		const childPath = [...path, key];
		return [
			{ path: childPath, key, value: child },
			...listFilterEntries({ value: child, path: childPath }),
		];
	});
};
