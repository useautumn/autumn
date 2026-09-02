/**
 * Fixtures are written in the language of the config, so our schema keys are
 * camelCase in TypeScript and snake_case on the wire. Only OUR keys — a record's
 * keys are the user's data (event property names, model slugs, metadata) and
 * must survive byte-for-byte.
 *
 * The distinction is read off the JSON Schema rather than a maintained list:
 * `properties` means the schema enumerated the keys, so we own them;
 * `additionalProperties` with no `properties` means "any key, values shaped like
 * this", so the keys belong to whoever wrote the config.
 */

export type JsonSchema = {
	type?: string | string[];
	properties?: Record<string, JsonSchema>;
	additionalProperties?: JsonSchema | boolean;
	items?: JsonSchema;
	anyOf?: JsonSchema[];
	allOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	[key: string]: unknown;
};

/** Keys are user data here, not schema fields. */
export const isRecordSchema = (schema: JsonSchema): boolean =>
	typeof schema.additionalProperties === "object" &&
	schema.additionalProperties !== null &&
	schema.properties === undefined;

export const toCamelCase = (key: string): string =>
	key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());

export const toSnakeCase = (key: string): string =>
	key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

const branchesOf = (schema: JsonSchema): JsonSchema[] => [
	...(schema.anyOf ?? []),
	...(schema.allOf ?? []),
	...(schema.oneOf ?? []),
];

/**
 * Walks a value against its schema, renaming only the keys the schema names.
 * `rename` runs on our keys; record keys are copied untouched, while their
 * VALUES keep recursing — `modelMarkups["gpt-4"].inputCost` is a user key
 * holding one of our objects.
 */
const recase = ({
	value,
	schema,
	rename,
	schemaKeyOf,
}: {
	value: unknown;
	schema: JsonSchema | undefined;
	rename: (key: string) => string;
	/** `properties` is always keyed by wire name, so camelCase input must map back. */
	schemaKeyOf: (key: string) => string;
}): unknown => {
	if (Array.isArray(value)) {
		return value.map((entry) =>
			recase({ value: entry, schema: schema?.items, rename, schemaKeyOf }),
		);
	}

	if (value === null || typeof value !== "object") return value;

	const source = value as Record<string, unknown>;
	// A union is only useful here if exactly one branch describes an object;
	// with several, the keys they agree on are what matters and disagreements
	// would need the value to pick a branch, which is out of scope.
	const effective =
		schema && !schema.properties && !isRecordSchema(schema)
			? (branchesOf(schema).find(
					(branch) => branch.properties ?? isRecordSchema(branch),
				) ?? schema)
			: schema;

	if (effective && isRecordSchema(effective)) {
		const valueSchema = effective.additionalProperties as JsonSchema;
		return Object.fromEntries(
			Object.entries(source).map(([key, entry]) => [
				key,
				recase({ value: entry, schema: valueSchema, rename, schemaKeyOf }),
			]),
		);
	}

	return Object.fromEntries(
		Object.entries(source).map(([key, entry]) => {
			const propertySchema = effective?.properties?.[schemaKeyOf(key)];
			return [
				rename(key),
				recase({ value: entry, schema: propertySchema, rename, schemaKeyOf }),
			];
		}),
	);
};

/** Wire (snake_case) → fixture (camelCase). */
export const wireToFixture = ({
	value,
	schema,
}: {
	value: unknown;
	schema: JsonSchema;
}): unknown =>
	recase({ value, schema, rename: toCamelCase, schemaKeyOf: (key) => key });

/** Fixture (camelCase) → wire (snake_case). */
export const fixtureToWire = ({
	value,
	schema,
}: {
	value: unknown;
	schema: JsonSchema;
}): unknown =>
	recase({ value, schema, rename: toSnakeCase, schemaKeyOf: toSnakeCase });
