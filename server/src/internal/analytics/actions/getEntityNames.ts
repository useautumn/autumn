import { getClickhouseClient } from "@/external/tinybird/initClickhouse.js";
import { escapeChString } from "../clickhouseUtils.js";

type EntityNameRow = {
	id: string;
	name: string | null;
	internal_customer_id: string;
};

export type EntityDisplayInfo = {
	name: string | null;
	internal_customer_id: string;
};

/** Looks up entity display fields from the entities datasource by their IDs. Returns a map of id -> { name, internal_customer_id }; ids with no row are omitted. */
export const getEntityNames = async ({
	entityIds,
	orgId,
	env,
}: {
	entityIds: string[];
	orgId: string;
	env: string;
}): Promise<Record<string, EntityDisplayInfo>> => {
	if (entityIds.length === 0) return {};

	const ch = getClickhouseClient();

	// Build the IN list as escaped literals to avoid URI-too-large
	// when the array is serialized as a query parameter.
	const inList = entityIds
		.map((id) => `'${escapeChString({ value: id })}'`)
		.join(",");

	const query = `
		SELECT id, name, internal_customer_id
		FROM entities FINAL
		WHERE org_id = {org_id:String}
			AND env = {env:String}
			AND id IN (${inList})
			AND deleted = 0
	`;

	const result = await ch.query({
		query,
		query_params: {
			org_id: orgId,
			env,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as { data: EntityNameRow[] };

	const displayMap: Record<string, EntityDisplayInfo> = {};
	for (const row of resultJson.data) {
		if (!row.id) continue;
		displayMap[row.id] = {
			name: row.name || null,
			internal_customer_id: row.internal_customer_id,
		};
	}

	return displayMap;
};
