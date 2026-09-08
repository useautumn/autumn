import type { JsonSchema } from "../casing/schemaKeyCasing";
import type { Overlay } from "../overlay/overlay";
import { resolveRef } from "../spec/resolveRef";
import { type EmitContext, objectMembers } from "./emitType";

const keysOf = ({
	schema,
	path,
	context,
}: {
	schema: JsonSchema;
	path: string;
	context: EmitContext;
}): string[] => {
	const keys: string[] = [];
	// The fixture type intersects allOf branches, so top-level members come from
	// every branch, in spec order.
	for (const branch of schema.allOf ?? []) {
		keys.push(...keysOf({ schema: branch, path, context }));
	}
	for (const member of objectMembers({ schema, path, context })) {
		keys.push(member.name);
	}
	return keys;
};

/** The fixture-side top-level keys of a collection item, in spec order. */
export const fixtureKeys = ({
	schema,
	overlay,
	collection,
}: {
	schema: JsonSchema;
	overlay: Overlay;
	collection: string;
}): string[] => [
	...new Set(keysOf({ schema, path: "", context: { overlay, collection } })),
];

/** Every object node a schema can be, through refs, arrays and branches. */
const objectNodesOf = ({
	schema,
	root,
	seen,
}: {
	schema: JsonSchema | undefined;
	root: JsonSchema;
	seen: Set<JsonSchema>;
}): JsonSchema[] => {
	const resolved = resolveRef({ schema, root });
	if (!resolved || seen.has(resolved)) return [];
	const next = new Set(seen).add(resolved);
	if (resolved.items)
		return objectNodesOf({ schema: resolved.items, root, seen: next });
	return [
		...(resolved.properties ? [resolved] : []),
		...[
			...(resolved.allOf ?? []),
			...(resolved.anyOf ?? []),
			...(resolved.oneOf ?? []),
		].flatMap((branch) => objectNodesOf({ schema: branch, root, seen: next })),
	];
};

/** The value schema of a record node, when the node is one. */
const recordValueSchema = ({
	schema,
	root,
}: {
	schema: JsonSchema;
	root: JsonSchema;
}): JsonSchema | undefined => {
	const resolved = resolveRef({ schema, root });
	const values = resolved?.additionalProperties;
	return typeof values === "object" ? (values as JsonSchema) : undefined;
};

const requiredPathsOf = ({
	schema,
	root,
	path,
	context,
	seen,
	out,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	path: string;
	context: EmitContext;
	seen: Set<JsonSchema>;
	out: Set<string>;
}): void => {
	for (const node of objectNodesOf({ schema, root, seen })) {
		if (seen.has(node)) continue;
		const next = new Set(seen).add(node);
		for (const member of objectMembers({ schema: node, path, context })) {
			const memberPath = path ? `${path}.${member.name}` : member.name;
			if (!member.optional) out.add(memberPath);
			requiredPathsOf({
				schema: member.schema,
				root,
				path: memberPath,
				context,
				seen: next,
				out,
			});
			// A record's keys are the user's; its values are still ours, one
			// level down at `.*` — the same convention the path hints use.
			const values = recordValueSchema({ schema: member.schema, root });
			if (values)
				requiredPathsOf({
					schema: values,
					root,
					path: `${memberPath}.*`,
					context,
					seen: next,
					out,
				});
		}
	}
};

/**
 * Fixture paths a config must state, array indices elided. A pulled row whose
 * value is null still writes them: dropping one emits source the fixture type
 * rejects, which is a pull that produces a config that will not compile.
 */
export const requiredFixturePaths = ({
	schema,
	root,
	overlay,
	collection,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	overlay: Overlay;
	collection: string;
}): string[] => {
	const out = new Set<string>();
	requiredPathsOf({
		schema,
		root,
		path: "",
		context: { overlay, collection },
		seen: new Set(),
		out,
	});
	return [...out].sort();
};
