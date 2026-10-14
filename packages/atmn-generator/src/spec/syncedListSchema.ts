import type { JsonSchema } from "../casing/schemaKeyCasing";
import type { SyncedListMeta } from "../collections";
import {
	catalogUpdateSchema,
	type OpenApiDocument,
	requestBodySchema,
} from "./loadSpec";

export const OPEN_ENUM_MARKER = "x-open-enum";

export const ENV_KEY_PATTERN = "^[a-z0-9_-]+$";

const envSchema = (): JsonSchema => ({
	type: "string",
	pattern: ENV_KEY_PATTERN,
	description:
		"The environment this webhook is registered in: `live` (`atmn push -p`), `sandbox` (the default sandbox), or a named sandbox's slug (its name lowercased, e.g. `qa-team`).",
});

export const syncedListItemSchema = ({
	spec,
	meta,
}: {
	spec: OpenApiDocument;
	meta: SyncedListMeta;
}): JsonSchema => {
	const body = requestBodySchema({ spec, path: meta.operationPath });
	const item = body.properties?.[meta.wireKey]?.items;
	if (!item?.properties)
		throw new Error(
			`\`${meta.wireKey}\` is not an array of objects on the ${meta.operationPath} body.`,
		);
	const [first, ...rest] = Object.entries(item.properties).map(
		([key, schema]): [string, JsonSchema] => [
			key,
			meta.openEnums.includes(key)
				? { ...schema, [OPEN_ENUM_MARKER]: true }
				: schema,
		],
	);
	return {
		...item,
		required: [
			...(Array.isArray(item.required) ? (item.required as string[]) : []),
			meta.envField,
		],
		properties: Object.fromEntries([
			...(first === undefined ? [] : [first]),
			[meta.envField, envSchema()],
			...rest,
		]),
	};
};

export const syncedListsEnvelope = ({
	spec,
	lists,
}: {
	spec: OpenApiDocument;
	lists: Readonly<Record<string, SyncedListMeta>>;
}): JsonSchema => ({
	type: "object",
	properties: Object.fromEntries(
		Object.entries(lists).map(([name, meta]) => [
			name,
			{ type: "array", items: syncedListItemSchema({ spec, meta }) },
		]),
	),
});

export const openEnumValues = ({
	spec,
	meta,
	field,
}: {
	spec: OpenApiDocument;
	meta: SyncedListMeta;
	field: string;
}): string[] => {
	const body = requestBodySchema({ spec, path: meta.operationPath });
	const values =
		body.properties?.[meta.wireKey]?.items?.properties?.[field]?.items?.enum;
	if (!Array.isArray(values))
		throw new Error(
			`open enum \`${field}\` has no item enum on ${meta.operationPath}.`,
		);
	return values as string[];
};

export const lintEnvelope = ({
	spec,
	lists,
}: {
	spec: OpenApiDocument;
	lists: Readonly<Record<string, SyncedListMeta>>;
}): JsonSchema => {
	const catalog = catalogUpdateSchema({ spec });
	return {
		...catalog,
		properties: {
			...catalog.properties,
			...syncedListsEnvelope({ spec, lists }).properties,
		},
	};
};
