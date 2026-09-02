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

/** `z.any()` emits `{}` — the schema describes nothing, so neither do we. */
export const isFreeFormSchema = (schema: JsonSchema | undefined): boolean =>
	schema !== undefined && Object.keys(schema).length === 0;

/** Keys are user data here, not schema fields. */
export const isRecordSchema = (schema: JsonSchema): boolean =>
	typeof schema.additionalProperties === "object" &&
	schema.additionalProperties !== null &&
	schema.properties === undefined;

/**
 * Operators in the migration filter DSL (`$startsWith`, `$some`, …) are literal
 * API keys, not snake_case fields — recasing one produces an operator the
 * server does not have.
 */
const isOperatorKey = (key: string): boolean => key.startsWith("$");

/**
 * Only `_` followed by a LETTER folds. `_1` has no uppercase form, so folding it
 * would consume the underscore with nothing left to restore it: `region_1` would
 * become `region1` and never come back.
 */
export const toCamelCase = (key: string): string =>
	isOperatorKey(key)
		? key
		: key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

export const toSnakeCase = (key: string): string =>
	isOperatorKey(key)
		? key
		: key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

/**
 * Follows `#/components/schemas/X`. Without this a `$ref` node has no
 * `properties` and no branches, so every key beneath it is recased blind —
 * including records like `CustomerData.metadata`.
 */
const resolveRef = ({
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
		const segments = ref.replace(/^#\//, "").split("/");
		let target: unknown = root;
		for (const segment of segments) {
			target = (target as Record<string, unknown> | undefined)?.[segment];
		}
		if (target === undefined) return current;
		current = target as JsonSchema;
	}
	return current;
};

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
	schema: rawSchema,
	rename,
	schemaKeyOf,
	root,
}: {
	value: unknown;
	schema: JsonSchema | undefined;
	rename: (key: string) => string;
	/** `properties` is always keyed by wire name, so camelCase input must map back. */
	schemaKeyOf: (key: string) => string;
	/** Document root, so `$ref` can be followed. */
	root?: JsonSchema;
}): unknown => {
	const schema = resolveRef({ schema: rawSchema, root });
	if (Array.isArray(value)) {
		return value.map((entry) =>
			recase({
				value: entry,
				schema: schema?.items,
				rename,
				schemaKeyOf,
				root,
			}),
		);
	}

	if (value === null || typeof value !== "object") return value;

	const source = value as Record<string, unknown>;
	// A union is only useful here if exactly one branch describes an object;
	// with several, the keys they agree on are what matters and disagreements
	// would need the value to pick a branch, which is out of scope.
	const effective =
		schema && !schema.properties && !isRecordSchema(schema)
			? (branchesOf(schema)
					.map((branch) => resolveRef({ schema: branch, root }) ?? branch)
					.find((branch) => branch.properties ?? isRecordSchema(branch)) ??
				schema)
			: schema;

	if (effective && isRecordSchema(effective)) {
		const valueSchema = effective.additionalProperties as JsonSchema;
		// A free-form value means the whole subtree is the user's, not just the
		// key it hangs off — `metadata: { crm_sync: { external_id } }`.
		if (isFreeFormSchema(valueSchema)) return source;
		return Object.fromEntries(
			Object.entries(source).map(([key, entry]) => [
				key,
				recase({
					value: entry,
					schema: valueSchema,
					rename,
					schemaKeyOf,
					root,
				}),
			]),
		);
	}

	return Object.fromEntries(
		Object.entries(source).map(([key, entry]) => {
			const propertySchema = effective?.properties?.[schemaKeyOf(key)];
			return [
				rename(key),
				recase({
					value: entry,
					schema: propertySchema,
					rename,
					schemaKeyOf,
					root,
				}),
			];
		}),
	);
};

/** Wire (snake_case) → fixture (camelCase). */
export const wireToFixture = ({
	value,
	schema,
	root,
}: {
	value: unknown;
	schema: JsonSchema;
	root?: JsonSchema;
}): unknown =>
	recase({
		value,
		schema,
		rename: toCamelCase,
		schemaKeyOf: (key) => key,
		root,
	});

/** Fixture (camelCase) → wire (snake_case). */
export const fixtureToWire = ({
	value,
	schema,
	root,
}: {
	value: unknown;
	schema: JsonSchema;
	root?: JsonSchema;
}): unknown =>
	recase({
		value,
		schema,
		rename: toSnakeCase,
		schemaKeyOf: toSnakeCase,
		root,
	});
