import {
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
} from "../casing/schemaKeyCasing";
import type { Overlay } from "../overlay/overlay";
import {
	describeByOverlay,
	fieldOverlay,
	fixtureNameFor,
	isDeprecatedByOverlay,
	isHidden,
	isInternalField,
	isRequiredByOverlay,
} from "../overlay/overlay";
import { OPEN_ENUM_MARKER } from "../spec/syncedListSchema";

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
		return schema[OPEN_ENUM_MARKER] === true
			? `Array<${item} | (string & {})>`
			: `Array<${item}>`;
	}

	if (type === "object" || schema.properties || isRecordSchema(schema)) {
		if (isRecordSchema(schema)) {
			const value = typeExpression({
				schema: schema.additionalProperties as JsonSchema,
				path,
				context,
			});
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

export type ObjectMember = {
	name: string;
	optional: boolean;
	description: string | undefined;
	deprecated: string | undefined;
	fieldPath: string;
	schema: JsonSchema;
};

const describedMember = ({
	description,
	defaultValue,
	note,
}: {
	description: unknown;
	defaultValue: unknown;
	note: string | undefined;
}): string | undefined => {
	const base =
		typeof description === "string"
			? description.replace(/\s+/g, " ").trim()
			: undefined;
	const parts = [
		...(base === undefined ? [] : [base]),
		...(defaultValue === undefined || /default/i.test(base ?? "")
			? []
			: [`Defaults to ${JSON.stringify(defaultValue)}.`]),
		...(note === undefined ? [] : [note]),
	];
	return parts.length === 0 ? undefined : parts.join(" ");
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
				description: describedMember({
					description: propertySchema.description,
					defaultValue: propertySchema.default,
					note: describeByOverlay({
						overlay: context.overlay,
						collection: context.collection,
						path: fieldPath,
					}),
				}),
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

export const emitFixtureType = ({
	name,
	schema,
	collection,
	overlay,
	path = "",
}: {
	name: string;
	schema: JsonSchema;
	collection: string;
	overlay: Overlay;
	path?: string;
}): string =>
	`export type ${name} = ${typeExpression({
		schema,
		path,
		context: { overlay, collection },
	})};\n`;
