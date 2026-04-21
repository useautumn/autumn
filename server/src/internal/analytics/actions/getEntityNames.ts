import { getClickhouseClient } from "@/external/tinybird/initClickhouse.js";
import { escapeChString } from "../clickhouseUtils.js";

type EntityNameRow = {
	id: string;
	name: string;
};

/** Looks up entity names from the entities datasource by their IDs. Returns a map of id -> name (or id if name is null/empty). */
export const getEntityNames = async ({
	entityIds,
	orgId,
	env,
}: {
	entityIds: string[];
	orgId: string;
	env: string;
}): Promise<Record<string, string>> => {
	if (entityIds.length === 0) return {};

	const ch = getClickhouseClient();

	// Build the IN list as escaped literals to avoid URI-too-large
	// when the array is serialized as a query parameter.
	const inList = entityIds
		.map((id) => `'${escapeChString({ value: id })}'`)
		.join(",");

	const query = `
		SELECT id, name
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

	const nameMap: Record<string, string> = {};
	for (const row of resultJson.data) {
		nameMap[row.id] = row.name || row.id;
	}

	// For any IDs not found in the datasource, fall back to the ID itself
	for (const id of entityIds) {
		if (!nameMap[id]) {
			nameMap[id] = id;
		}
	}

	return nameMap;
};
