import type { JsonSchema } from "../casing/schemaKeyCasing";
import type { Overlay } from "../overlay/overlay";
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
