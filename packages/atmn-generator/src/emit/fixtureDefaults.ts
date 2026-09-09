import type { JsonSchema } from "../casing/schemaKeyCasing";
import { toCamelCase } from "../casing/schemaKeyCasing";
import {
	fixtureNameFor,
	type Overlay,
	omitWhenDefaultFieldsOf,
} from "../overlay/overlay";
import { resolveRef } from "../spec/resolveRef";
import { type EmitContext, objectMembers } from "./emitType";

export type FixtureDefault = {
	/** Fixture path from the item root, e.g. "config". */
	readonly path: string;
	/** The object as the fixture would state it when every child is at its spec default. */
	readonly default: Record<string, unknown>;
};

const propertyAt = ({
	schema,
	root,
	wirePath,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	wirePath: string;
}): JsonSchema | undefined => {
	let node = resolveRef({ schema, root });
	for (const segment of wirePath.split(".")) {
		const child = node?.properties?.[segment];
		node = resolveRef({ schema: child, root });
		if (!node) return undefined;
	}
	return node;
};

/**
 * What each `omitWhenDefault` object reads as when nothing in it is stated,
 * in fixture casing: pull compares the server's row against this and leaves
 * a matching object out. Every child must carry a spec default, or the object
 * has no "at default" shape to compare with, which is a generate-time error.
 */
export const fixtureDefaults = ({
	schema,
	root,
	overlay,
	collection,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	overlay: Overlay;
	collection: string;
}): FixtureDefault[] => {
	const context: EmitContext = { overlay, collection };
	return omitWhenDefaultFieldsOf({ overlay, collection }).map((wirePath) => {
		// The runtime compares top-level fixture keys, so a nested path would never match.
		if (wirePath.includes("."))
			throw new Error(
				`\`${collection}.${wirePath}\` is marked omitWhenDefault, but only a top-level object can be.`,
			);
		const node = propertyAt({ schema, root, wirePath });
		if (!node?.properties)
			throw new Error(
				`\`${collection}.${wirePath}\` is marked omitWhenDefault but is not an object on the catalogV2.update body.`,
			);
		const members = objectMembers({ schema: node, path: wirePath, context });
		const value: Record<string, unknown> = {};
		for (const member of members) {
			const memberSchema =
				resolveRef({ schema: member.schema, root }) ?? member.schema;
			if (memberSchema.default === undefined)
				throw new Error(
					`\`${collection}.${member.fieldPath}\` has no spec default, so \`${wirePath}\` cannot be omitted at default.`,
				);
			value[member.name] = memberSchema.default;
		}
		const segments = wirePath.split(".");
		const path = segments
			.map((segment, index) =>
				fixtureNameFor({
					overlay,
					collection,
					path: segments.slice(0, index + 1).join("."),
					recased: toCamelCase(segment),
				}),
			)
			.join(".");
		return { path, default: value };
	});
};
