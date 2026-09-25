import type { JsonSchema } from "../casing/schemaKeyCasing";
import type { SyncedListMeta } from "../collections";
import {
	catalogUpdateSchema,
	type OpenApiDocument,
	requestBodySchema,
} from "./loadSpec";

/** Marks a record that a config states per environment; the type emitter names its keys. */
export const ENV_KEYED_MARKER = "x-env-keyed";

/** Marks an enum list a newer server may extend: typed as the enum or any string. */
export const OPEN_ENUM_MARKER = "x-open-enum";

/** `live`, `sandbox`, or a sandbox's slug: lowercase, digits, `_` and `-`, never a space. */
export const ENV_KEY_PATTERN = "^[a-z0-9_-]+$";

const envKeyedSchema = (value: JsonSchema): JsonSchema => ({
	type: "object",
	...(value.description === undefined
		? {}
		: { description: value.description }),
	propertyNames: { type: "string", pattern: ENV_KEY_PATTERN },
	additionalProperties: value,
	[ENV_KEYED_MARKER]: true,
});

/** One item as a fixture states it: the sync body's item, env-keyed fields as maps. */
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
	for (const field of meta.envKeyed) {
		if (item.properties[field] === undefined)
			throw new Error(
				`env-keyed \`${field}\` is not a field of ${meta.operationPath} \`${meta.wireKey}\`.`,
			);
	}
	return {
		...item,
		properties: Object.fromEntries(
			Object.entries(item.properties).map(([key, schema]) => [
				key,
				meta.envKeyed.includes(key)
					? envKeyedSchema(schema)
					: meta.openEnums.includes(key)
						? { ...schema, [OPEN_ENUM_MARKER]: true }
						: schema,
			]),
		),
	};
};

/** Every synced list under its config key, shaped like the catalog envelope. */
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

/** The names an open-enum list field knows today, read off the sync body. */
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

/** Everything a config states, for lint: the catalog envelope plus every synced list. */
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
