export const escapeApl = (value: string): string =>
	value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export type StatusBucket = "all" | "2xx" | "4xx" | "5xx";
export type HttpMethodFilter =
	| "all"
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE";

const statusBucketClause = (bucket: StatusBucket): string | null => {
	switch (bucket) {
		case "2xx":
			return "statusCode >= 200 and statusCode < 300";
		case "4xx":
			return "statusCode >= 400 and statusCode < 500";
		case "5xx":
			return "statusCode >= 500 and statusCode < 600";
		default:
			return null;
	}
};

export const buildRequestLogsQuery = ({
	orgSlug,
	env,
	customerId,
	method,
	statusBucket,
	search,
	limit = 200,
	rangeDays = 7,
}: {
	orgSlug: string;
	env: string;
	customerId: string;
	method?: HttpMethodFilter;
	statusBucket?: StatusBucket;
	search?: string;
	limit?: number;
	rangeDays?: number;
}): string => {
	const filters: string[] = [
		`_time > ago(${rangeDays}d)`,
		"isnotnull(statusCode)",
		"isnotnull(['req.url'])",
		`(['context.org_slug'] == '${escapeApl(orgSlug)}' or orgSlug == '${escapeApl(orgSlug)}')`,
		`(['context.env'] == '${escapeApl(env)}' or env == '${escapeApl(env)}')`,
		`(['req.customer_id'] == '${escapeApl(customerId)}' or customer_id == '${escapeApl(customerId)}')`,
	];

	if (method && method !== "all") {
		filters.push(`['req.method'] == '${escapeApl(method)}'`);
	}

	const statusClause = statusBucketClause(statusBucket ?? "all");
	if (statusClause) filters.push(statusClause);

	if (search?.trim()) {
		const needle = escapeApl(search.trim());
		filters.push(
			`(['req.url'] contains '${needle}' or msg contains '${needle}')`,
		);
	}

	const wheres = filters.map((filter) => `| where ${filter}`).join("\n");

	return `['express']
${wheres}
| order by _time desc
| limit ${limit}`;
};
