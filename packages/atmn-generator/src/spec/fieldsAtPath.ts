import {
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
} from "../casing/schemaKeyCasing";
import { resolveRef } from "./resolveRef";

/**
 * The property names an object at a fixture path can have, across every
 * branch. `undefined` when the path does not exist in the schema at all.
 * Segments are fixture-cased with array indices elided, `*` for a record's
 * values — the same convention as the hints and the lint rules.
 */

const branchesOf = ({
	schema,
	root,
}: {
	schema: JsonSchema;
	root: JsonSchema;
}): JsonSchema[] =>
	[
		...(schema.allOf ?? []),
		...(schema.anyOf ?? []),
		...(schema.oneOf ?? []),
	].map((branch) => resolveRef({ schema: branch, root }) ?? branch);

/** Every object node the schema can be, unwrapping arrays and branches. */
const objectNodesOf = ({
	schema,
	root,
	seen = new Set(),
}: {
	schema: JsonSchema | undefined;
	root: JsonSchema;
	seen?: Set<JsonSchema>;
}): JsonSchema[] => {
	const resolved = resolveRef({ schema, root });
	if (!resolved || seen.has(resolved)) return [];
	const nextSeen = new Set(seen).add(resolved);
	if (resolved.items) {
		return objectNodesOf({ schema: resolved.items, root, seen: nextSeen });
	}
	const own = resolved.properties || isRecordSchema(resolved) ? [resolved] : [];
	return [
		...own,
		...branchesOf({ schema: resolved, root }).flatMap((branch) =>
			objectNodesOf({ schema: branch, root, seen: nextSeen }),
		),
	];
};

const childSchemas = ({
	nodes,
	segment,
	root,
}: {
	nodes: JsonSchema[];
	segment: string;
	root: JsonSchema;
}): JsonSchema[] =>
	nodes
		.flatMap((node) => {
			if (segment === "*") {
				return isRecordSchema(node)
					? [node.additionalProperties as JsonSchema]
					: [];
			}
			return Object.entries(node.properties ?? {})
				.filter(([wireKey]) => toCamelCase(wireKey) === segment)
				.map(([, child]) => child);
		})
		.flatMap((child) => objectNodesOf({ schema: child, root }));

export const fieldsAtPath = ({
	schema,
	root,
	path,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	path: string;
}): Set<string> | undefined => {
	let nodes = objectNodesOf({ schema, root });
	for (const segment of path === "" ? [] : path.split(".")) {
		nodes = childSchemas({ nodes, segment, root });
		if (nodes.length === 0) return undefined;
	}
	const fields = new Set<string>();
	for (const node of nodes) {
		for (const wireKey of Object.keys(node.properties ?? {})) {
			fields.add(toCamelCase(wireKey));
		}
	}
	return fields;
};
