import { toCamelCase } from "../casing/schemaKeyCasing";
import type { FixturePath } from "./schemaPaths";

/**
 * Every path an executed config's wire document actually sets, recased to
 * fixture (camelCase) keys with array indices elided — the same convention
 * `schemaPaths` uses, so the two maps can be compared key for key. String
 * leaf values are collected per path for enum coverage.
 */
export const documentPaths = ({
	document,
}: {
	document: unknown;
}): Map<FixturePath, Set<string>> => {
	const paths = new Map<FixturePath, Set<string>>();

	const visit = ({
		value,
		fixturePath,
	}: {
		value: unknown;
		fixturePath: string;
	}): void => {
		if (Array.isArray(value)) {
			for (const entry of value) visit({ value: entry, fixturePath });
			return;
		}
		if (value === null || typeof value !== "object") return;

		for (const [wireKey, entry] of Object.entries(
			value as Record<string, unknown>,
		)) {
			const childFixturePath = fixturePath
				? `${fixturePath}.${toCamelCase(wireKey)}`
				: toCamelCase(wireKey);

			const values = paths.get(childFixturePath) ?? new Set<string>();
			if (typeof entry === "string") values.add(entry);
			paths.set(childFixturePath, values);

			visit({ value: entry, fixturePath: childFixturePath });
		}
	};

	visit({ value: document, fixturePath: "" });

	return paths;
};
