import type { CustomerDisplayInfo } from "@autumn/shared";
import { getClickhouseClient } from "@/external/tinybird/initClickhouse.js";
import { escapeChString } from "../clickhouseUtils.js";

// Mirrors the ClickHouse `customers` columns: `id` is the customer's own
// public id.
type CustomerNameRow = {
	id: string;
	name: string | null;
	email: string | null;
};

/** Looks up customer display fields from the customers datasource. Returns a map of customer id -> { name, email }; customer ids with no row are omitted. */
export const getCustomerNames = async ({
	customerIds,
	orgId,
	env,
}: {
	customerIds: string[];
	orgId: string;
	env: string;
}): Promise<Record<string, CustomerDisplayInfo>> => {
	if (customerIds.length === 0) return {};

	const ch = getClickhouseClient();

	const inList = customerIds
		.map((id) => `'${escapeChString({ value: id })}'`)
		.join(",");

	const query = `
		SELECT id, name, email
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

	const displayMap: Record<string, CustomerDisplayInfo> = {};
	for (const row of resultJson.data) {
		if (!row.id) continue;
		displayMap[row.id] = { name: row.name || null, email: row.email || null };
	}

	return displayMap;
};
