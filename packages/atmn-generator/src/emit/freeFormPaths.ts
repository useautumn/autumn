import {
	isFreeFormSchema,
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
} from "../casing/schemaKeyCasing";

/**
 * Where the runtime must stop recasing. Emitting these instead of the whole 4MB
 * spec is what lets the CLI convert fixtures to wire without carrying a schema:
 * it needs to know where to stop, and nothing else.
 *
 * Two kinds, and conflating them is a bug in both directions:
 *
 * - `recordPaths` — the KEYS are the user's, the values are still ours.
 *   `modelMarkups["gpt-4"].inputCost`: slug preserved, field recased.
 * - `frozenPaths` — the whole subtree is the user's, keys and values.
 *   `metadata` is `z.record(string, z.any())`, so nothing below it is ours.
 *
 * Paths are fixture-side (camelCase), array indices elided, `*` for a record's
 * value position.
 */
export type WirePathHints = {
	recordPaths: string[];
	frozenPaths: string[];
};

export const wirePathHints = ({
	schema,
	root,
}: {
	schema: JsonSchema;
	root?: JsonSchema;
}): WirePathHints => {
	const recordPaths = new Set<string>();
	const frozenPaths = new Set<string>();

	const resolve = (node: JsonSchema | undefined): JsonSchema | undefined => {
		let current = node;
		const seen = new Set<string>();
		while (typeof current?.$ref === "string" && root) {
			if (seen.has(current.$ref)) return current;
			seen.add(current.$ref);
			let target: unknown = root;
			for (const segment of current.$ref.replace(/^#\//, "").split("/")) {
				target = (target as Record<string, unknown> | undefined)?.[segment];
			}
			if (target === undefined) return current;
			current = target as JsonSchema;
		}
		return current;
	};

	const walk = ({
		node,
		path,
		seen,
	}: {
		node: JsonSchema | undefined;
		path: string;
		seen: Set<JsonSchema>;
	}): void => {
		const schemaNode = resolve(node);
		if (!schemaNode || seen.has(schemaNode)) return;
		const nextSeen = new Set(seen).add(schemaNode);

		if (isRecordSchema(schemaNode)) {
			const value = schemaNode.additionalProperties as JsonSchema;
			if (isFreeFormSchema(value)) {
				frozenPaths.add(path);
				return;
			}
			recordPaths.add(path);
			walk({ node: value, path: `${path}.*`, seen: nextSeen });
			return;
		}

		if (schemaNode.items)
			walk({ node: schemaNode.items, path, seen: nextSeen });

		for (const branch of [
			...(schemaNode.anyOf ?? []),
			...(schemaNode.oneOf ?? []),
			...(schemaNode.allOf ?? []),
		]) {
			walk({ node: branch, path, seen: nextSeen });
		}

		for (const [key, child] of Object.entries(schemaNode.properties ?? {})) {
			const childPath = path ? `${path}.${toCamelCase(key)}` : toCamelCase(key);
			walk({ node: child, path: childPath, seen: nextSeen });
		}
	};

	walk({ node: schema, path: "", seen: new Set() });
	return {
		recordPaths: [...recordPaths].sort(),
		frozenPaths: [...frozenPaths].sort(),
	};
};
