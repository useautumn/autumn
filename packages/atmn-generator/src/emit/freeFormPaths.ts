import {
	isFreeFormSchema,
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
} from "../casing/schemaKeyCasing";
import type { Overlay } from "../overlay/overlay";

export type WirePathHints = {
	recordPaths: string[];
	frozenPaths: string[];
	renamedPaths: Record<string, string>;
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
		renamedPaths: {},
	};
};

export const renamedPaths = ({
	overlay,
	roots,
}: {
	overlay: Overlay;
	roots: Record<string, string>;
}): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const [collection, fields] of Object.entries(overlay.collections)) {
		const root = roots[collection];
		if (root === undefined) continue;
		for (const [path, field] of Object.entries(fields)) {
			if (field.rename === undefined) continue;
			const segments = path.split(".");
			const wireKey = segments[segments.length - 1] ?? path;
			const parents = segments.slice(0, -1).map(toCamelCase);
			out[[root, ...parents, field.rename].join(".")] = wireKey;
		}
	}
	return out;
};

export const withRenames = ({
	hints,
	renames,
}: {
	hints: WirePathHints;
	renames: Record<string, string>;
}): WirePathHints => ({ ...hints, renamedPaths: renames });
