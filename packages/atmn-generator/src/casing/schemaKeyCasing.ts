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

export const isFreeFormSchema = (schema: JsonSchema | undefined): boolean =>
	schema !== undefined && Object.keys(schema).length === 0;

export const isRecordSchema = (schema: JsonSchema): boolean =>
	typeof schema.additionalProperties === "object" &&
	schema.additionalProperties !== null &&
	schema.properties === undefined;

const isOperatorKey = (key: string): boolean => key.startsWith("$");

export const toCamelCase = (key: string): string =>
	isOperatorKey(key)
		? key
		: key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

export const toSnakeCase = (key: string): string =>
	isOperatorKey(key)
		? key
		: key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

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
	schemaKeyOf: (key: string) => string;
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
	const effective =
		schema && !schema.properties && !isRecordSchema(schema)
			? (branchesOf(schema)
					.map((branch) => resolveRef({ schema: branch, root }) ?? branch)
					.find((branch) => branch.properties ?? isRecordSchema(branch)) ??
				schema)
			: schema;

	if (effective && isRecordSchema(effective)) {
		const valueSchema = effective.additionalProperties as JsonSchema;
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
