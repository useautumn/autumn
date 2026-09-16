import { type JsonSchema, toCamelCase } from "../casing/schemaKeyCasing";
import type { Overlay } from "../overlay/overlay";
import { resolveRef } from "./resolveRef";

/**
 * An `x-internal` field the server both returns on GET and accepts on update
 * is a round-trip field: a value the catalog holds and a push can restate.
 * Hidden from the fixture, a pull drops it and the next push reads as a
 * change — so each one must be exposed, or named as server-owned on purpose.
 */

export type InternalRoundTripField = {
	/** Fixture-cased dotted path from the collection root, e.g. "items.price.allocatedBilling". */
	path: string;
	wireKey: string;
};

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

/** Every `x-internal` property under a schema, by fixture path; arrays elided. */
const internalFieldsUnder = ({
	schema,
	root,
	path,
	seen,
	out,
}: {
	schema: JsonSchema | undefined;
	root: JsonSchema;
	path: string;
	seen: Set<JsonSchema>;
	out: Map<string, string>;
}): void => {
	const resolved = resolveRef({ schema, root });
	if (!resolved || seen.has(resolved)) return;
	const nextSeen = new Set(seen).add(resolved);
	if (resolved.items) {
		internalFieldsUnder({
			schema: resolved.items,
			root,
			path,
			seen: nextSeen,
			out,
		});
	}
	for (const branch of branchesOf({ schema: resolved, root })) {
		internalFieldsUnder({ schema: branch, root, path, seen: nextSeen, out });
	}
	for (const [wireKey, child] of Object.entries(resolved.properties ?? {})) {
		const childPath = path
			? `${path}.${toCamelCase(wireKey)}`
			: toCamelCase(wireKey);
		if ((child as JsonSchema)["x-internal"] === true)
			out.set(childPath, wireKey);
		internalFieldsUnder({
			schema: child as JsonSchema,
			root,
			path: childPath,
			seen: nextSeen,
			out,
		});
	}
};

const internalFieldPaths = ({
	schema,
	root,
}: {
	schema: JsonSchema;
	root: JsonSchema;
}): Map<string, string> => {
	const out = new Map<string, string>();
	internalFieldsUnder({ schema, root, path: "", seen: new Set(), out });
	return out;
};

/** Internal fields present on both the GET row and the update row for a collection. */
export const internalRoundTripFields = ({
	responseItem,
	requestItem,
	root,
}: {
	responseItem: JsonSchema;
	requestItem: JsonSchema;
	root: JsonSchema;
}): InternalRoundTripField[] => {
	const returned = internalFieldPaths({ schema: responseItem, root });
	const accepted = internalFieldPaths({ schema: requestItem, root });
	return [...returned]
		.filter(([path]) => accepted.has(path))
		.map(([path, wireKey]) => ({ path, wireKey }));
};

/** The overlay's verdict on one round-trip field. */
export const roundTripFieldVerdict = ({
	overlay,
	field,
}: {
	overlay: Overlay;
	field: InternalRoundTripField;
}): "exposed" | "server-owned" | "unaccounted" => {
	if (overlay.exposeInternal.includes(field.wireKey)) return "exposed";
	if (field.wireKey in overlay.serverOwnedInternal) return "server-owned";
	return "unaccounted";
};
