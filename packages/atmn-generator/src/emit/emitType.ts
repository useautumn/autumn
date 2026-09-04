import {
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
} from "../casing/schemaKeyCasing";
import type { Overlay } from "../overlay/overlay";
import {
	fieldOverlay,
	fixtureNameFor,
	isDeprecatedByOverlay,
	isHidden,
	isInternalField,
	isRequiredByOverlay,
} from "../overlay/overlay";

/**
 * Emits TypeScript source for a fixture type. Formatting is deliberately not a
 * concern here — the output is run through the repo's Biome afterwards, which
 * owns indentation, trailing commas and line breaks. That removes the hard half
 * of the problem and keeps this function about shape only.
 */

export type EmitContext = {
	overlay: Overlay;
	collection: string;
};

const childPath = ({ path, key }: { path: string; key: string }): string =>
	path ? `${path}.${key}` : key;

const literalUnion = (values: unknown[]): string =>
	values.map((value) => JSON.stringify(value)).join(" | ");

const branchesOf = (schema: JsonSchema): JsonSchema[] => [
	...(schema.anyOf ?? []),
	...(schema.oneOf ?? []),
];

/** JSON Schema → a TypeScript type expression. */
export const typeExpression = ({
	schema,
	path,
	context,
}: {
	schema: JsonSchema;
	path: string;
	context: EmitContext;
}): string => {
	if (Array.isArray(schema.enum)) return literalUnion(schema.enum);
	if (schema.const !== undefined) return JSON.stringify(schema.const);

	const branches = branchesOf(schema);
	if (branches.length > 0) {
		const parts = branches.map((branch) =>
			typeExpression({ schema: branch, path, context }),
		);
		return [...new Set(parts)].join(" | ");
	}

	if (schema.allOf) {
		const parts = schema.allOf.map((branch) =>
			typeExpression({ schema: branch, path, context }),
		);
		return [...new Set(parts)].join(" & ");
	}

	const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

	if (type === "array") {
		const item = schema.items
			? typeExpression({ schema: schema.items, path, context })
			: "unknown";
		return `Array<${item}>`;
	}

	if (type === "object" || schema.properties || isRecordSchema(schema)) {
		if (isRecordSchema(schema)) {
			const value = typeExpression({
				schema: schema.additionalProperties as JsonSchema,
				path,
				context,
			});
			// Keys here are the user's data, so they stay a free string index.
			return `Record<string, ${value}>`;
		}
		return objectTypeExpression({ schema, path, context });
	}

	if (type === "string") return "string";
	if (type === "number" || type === "integer") return "number";
	if (type === "boolean") return "boolean";
	if (type === "null") return "null";
	return "unknown";
};

/** One object-schema property that survives the skip rules, in spec order. */
export type ObjectMember = {
	name: string;
	optional: boolean;
	description: string | undefined;
	/** The overlay's reason when the field is kept for existing catalogs only. */
	deprecated: string | undefined;
	fieldPath: string;
	schema: JsonSchema;
};

export const objectMembers = ({
	schema,
	path,
	context,
}: {
	schema: JsonSchema;
	path: string;
	context: EmitContext;
}): ObjectMember[] => {
	const properties = schema.properties ?? {};
	const required = new Set(
		Array.isArray(schema.required) ? (schema.required as string[]) : [],
	);

	return Object.entries(properties).flatMap(([wireKey, propertySchema]) => {
		const fieldPath = childPath({ path, key: wireKey });
		if (
			isInternalField({
				overlay: context.overlay,
				wireKey,
				schema: propertySchema,
			})
		) {
			return [];
		}
		if (
			isHidden({
				overlay: context.overlay,
				collection: context.collection,
				path: fieldPath,
			})
		) {
			return [];
		}

		return [
			{
				name: fixtureNameFor({
					overlay: context.overlay,
					collection: context.collection,
					path: fieldPath,
					recased: toCamelCase(wireKey),
				}),
				optional: !(
					required.has(wireKey) ||
					isRequiredByOverlay({
						overlay: context.overlay,
						collection: context.collection,
						path: fieldPath,
					})
				),
				description:
					typeof propertySchema.description === "string"
						? propertySchema.description.replace(/\s+/g, " ").trim()
						: undefined,
				deprecated: isDeprecatedByOverlay({
					overlay: context.overlay,
					collection: context.collection,
					path: fieldPath,
				})
					? fieldOverlay({
							overlay: context.overlay,
							collection: context.collection,
							path: fieldPath,
						})?.reason
					: undefined,
				fieldPath,
				schema: propertySchema,
			},
		];
	});
};

const memberText = ({
	member,
	context,
}: {
	member: ObjectMember;
	context: EmitContext;
}): string => {
	const notes = [
		...(member.description === undefined ? [] : [member.description]),
		...(member.deprecated === undefined
			? []
			: [`@deprecated ${member.deprecated}`]),
	];
	const description = notes.length === 0 ? "" : `/** ${notes.join(" ")} */\n`;
	const optional = member.optional ? "?" : "";
	return `${description}${member.name}${optional}: ${typeExpression({
		schema: member.schema,
		path: member.fieldPath,
		context,
	})};`;
};

const objectTypeExpression = ({
	schema,
	path,
	context,
}: {
	schema: JsonSchema;
	path: string;
	context: EmitContext;
}): string => {
	const members = objectMembers({ schema, path, context }).map((member) =>
		memberText({ member, context }),
	);

	return `{\n${members.join("\n")}\n}`;
};

/** A named exported type for one collection item, e.g. `Feature`. */
export const emitFixtureType = ({
	name,
	schema,
	collection,
	overlay,
}: {
	name: string;
	schema: JsonSchema;
	collection: string;
	overlay: Overlay;
}): string =>
	`export type ${name} = ${typeExpression({
		schema,
		path: "",
		context: { overlay, collection },
	})};\n`;
