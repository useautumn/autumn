import type { JsonSchema } from "../casing/schemaKeyCasing";

/**
 * Follows `#/components/schemas/X`. A `$ref` node has no `properties` and no
 * branches, so anything walking the schema is blind beneath one.
 */
export const resolveRef = ({
	schema,
	root,
}: {
	schema: JsonSchema | undefined;
	root: JsonSchema | undefined;
}): JsonSchema | undefined => {
	let current = schema;
	const seen = new Set<string>();
	while (typeof current?.$ref === "string" && root) {
		const ref = current.$ref;
		if (seen.has(ref)) return current;
		seen.add(ref);
		let target: unknown = root;
		for (const segment of ref.replace(/^#\//, "").split("/")) {
			target = (target as Record<string, unknown> | undefined)?.[segment];
		}
		if (target === undefined) return current;
		current = target as JsonSchema;
	}
	return current;
};
