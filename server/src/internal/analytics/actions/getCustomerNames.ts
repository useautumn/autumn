import { getClickhouseClient } from "@/external/tinybird/initClickhouse.js";

type CustomerNameRow = {
	id: string;
	name: string | null;
};

/** Escapes a string for safe use in a ClickHouse string literal (single-quoted). */
const escapeChString = ({ value }: { value: string }): string =>
	value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Looks up customer names from the customers datasource by their IDs. Returns a map of id -> name (or id if name is null/empty). */
export const getCustomerNames = async ({
	customerIds,
	orgId,
	env,
}: {
	customerIds: string[];
	orgId: string;
	env: string;
}): Promise<Record<string, string>> => {
	if (customerIds.length === 0) return {};

	const ch = getClickhouseClient();

	const inList = customerIds
		.map((id) => `'${escapeChString({ value: id })}'`)
		.join(",");

	const query = `
		SELECT id, name
		FROM customers FINAL
		WHERE org_id = {org_id:String}
			AND env = {env:String}
			AND id IN (${inList})
	`;

	const result = await ch.query({
		query,
		query_params: {
			org_id: orgId,
			env,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as { data: CustomerNameRow[] };

	const nameMap: Record<string, string> = {};
	for (const row of resultJson.data) {
		if (!row.id) continue;
		nameMap[row.id] = row.name || row.id;
	}

	for (const id of customerIds) {
		if (!nameMap[id]) {
			nameMap[id] = id;
		}
	}

	return nameMap;
};
