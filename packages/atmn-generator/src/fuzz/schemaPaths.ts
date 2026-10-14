import {
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
} from "../casing/schemaKeyCasing";
import { isHidden, isInternalField, type Overlay } from "../overlay/overlay";
import { resolveRef } from "../spec/resolveRef";

export type FixturePath = string;

const branchesOf = (schema: JsonSchema): JsonSchema[] =>
	[
		...(schema.allOf ?? []),
		...(schema.anyOf ?? []),
		...(schema.oneOf ?? []),
	].filter((branch) => branch.type !== "null");

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

export const schemaPaths = ({
	schema,
	root,
	overlay,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	overlay: Overlay;
}): Map<FixturePath, Set<string>> =>
	schemaPathIndex({ schema, root, overlay }).enums;

export const schemaDefaults = ({
	schema,
	root,
	overlay,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	overlay: Overlay;
}): Map<FixturePath, unknown> =>
	schemaPathIndex({ schema, root, overlay }).defaults;

const schemaPathIndex = ({
	schema,
	root,
	overlay,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	overlay: Overlay;
}): {
	enums: Map<FixturePath, Set<string>>;
	defaults: Map<FixturePath, unknown>;
} => {
	const paths = new Map<FixturePath, Set<string>>();
	const defaults = new Map<FixturePath, unknown>();

	const visit = ({
		schema: node,
		fixturePath,
		collection,
		wirePath,
		seen,
	}: {
		schema: JsonSchema | undefined;
		fixturePath: string;
		collection: string;
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
			if (resolvedProperty.default !== undefined)
				defaults.set(childFixturePath, resolvedProperty.default);

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

	return { enums: paths, defaults };
};
