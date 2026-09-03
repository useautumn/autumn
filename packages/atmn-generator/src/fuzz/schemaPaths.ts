import {
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
} from "../casing/schemaKeyCasing";
import { isHidden, isInternalField, type Overlay } from "../overlay/overlay";
import { resolveRef } from "../spec/resolveRef";

/** Fixture-side dot path with array indices elided, `*` for a record's values. */
export type FixturePath = string;

const branchesOf = (schema: JsonSchema): JsonSchema[] =>
	[
		...(schema.allOf ?? []),
		...(schema.anyOf ?? []),
		...(schema.oneOf ?? []),
	].filter((branch) => branch.type !== "null");

/** Every enum/const value a schema node can take, across its `anyOf`/`oneOf` alternatives. */
const enumValuesOf = (schema: JsonSchema): Set<string> => {
	const values = new Set<string>();
	const collect = (node: JsonSchema) => {
		if (Array.isArray(node.enum))
			for (const value of node.enum) values.add(String(value));
		if (node.const !== undefined) values.add(String(node.const));
		for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? [])])
			collect(branch);
	};
	collect(schema);
	return values;
};

/**
 * Every leaf/object path under the envelope, keyed fixture-side, with the enum
 * values the spec allows there. Skips overlay-hidden and x-internal fields —
 * the same reach as the generated CLI, so "coverage" means coverage of what a
 * config could actually state.
 */
export const schemaPaths = ({
	schema,
	root,
	overlay,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	overlay: Overlay;
}): Map<FixturePath, Set<string>> => {
	const paths = new Map<FixturePath, Set<string>>();

	const visit = ({
		schema: node,
		fixturePath,
		collection,
		wirePath,
		seen,
	}: {
		schema: JsonSchema | undefined;
		fixturePath: string;
		/** Top-level wire collection ("plans", "features") once inside one, else "". */
		collection: string;
		/** Relative to the collection ITEM root — resets when `collection` is entered. */
		wirePath: string;
		seen: Set<JsonSchema>;
	}): void => {
		const resolved = resolveRef({ schema: node, root });
		if (!resolved || seen.has(resolved)) return;
		const nextSeen = new Set(seen).add(resolved);

		if (resolved.items) {
			visit({
				schema: resolved.items,
				fixturePath,
				collection,
				wirePath,
				seen: nextSeen,
			});
			return;
		}

		for (const branch of branchesOf(resolved)) {
			visit({
				schema: branch,
				fixturePath,
				collection,
				wirePath,
				seen: nextSeen,
			});
		}

		if (isRecordSchema(resolved)) {
			visit({
				schema: resolved.additionalProperties as JsonSchema,
				fixturePath: `${fixturePath}.*`,
				collection,
				wirePath,
				seen: nextSeen,
			});
			return;
		}

		for (const [wireKey, property] of Object.entries(
			resolved.properties ?? {},
		)) {
			if (isInternalField({ overlay, wireKey, schema: property })) continue;
			const childWirePath = wirePath ? `${wirePath}.${wireKey}` : wireKey;
			if (collection && isHidden({ overlay, collection, path: childWirePath }))
				continue;

			const childFixturePath = fixturePath
				? `${fixturePath}.${toCamelCase(wireKey)}`
				: toCamelCase(wireKey);
			const resolvedProperty =
				resolveRef({ schema: property, root }) ?? property;

			const values = paths.get(childFixturePath) ?? new Set<string>();
			for (const value of enumValuesOf(resolvedProperty)) values.add(value);
			paths.set(childFixturePath, values);

			// Entering a fresh top-level collection resets the item-relative wire
			// path, matching the overlay's FieldPath convention.
			visit({
				schema: property,
				fixturePath: childFixturePath,
				collection: fixturePath === "" ? wireKey : collection,
				wirePath: fixturePath === "" ? "" : childWirePath,
				seen: nextSeen,
			});
		}
	};

	visit({
		schema,
		fixturePath: "",
		collection: "",
		wirePath: "",
		seen: new Set(),
	});

	return paths;
};
