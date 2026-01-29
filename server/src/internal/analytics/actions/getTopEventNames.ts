import { getClickhouseClient } from "@/external/tinybird/initClickhouse.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { queryWithCache } from "@/utils/cacheUtils/queryWithCache.js";

type TopEventNameRow = {
	event_name: string;
	count: string;
};

type TopEventNamesResult = {
	eventNames: string[];
	result: { data: TopEventNameRow[] };
};

const TOP_EVENT_NAMES_CACHE_TTL = 60 * 5; // 5 minutes

/** Gets top event names by count for the organization */
export const getTopEventNames = async ({
	ctx,
	limit = 3,
}: {
	ctx: AutumnContext;
	limit?: number;
}): Promise<TopEventNamesResult> => {
	const { org, env } = ctx;
	const cacheKey = `top_event_names:${org.id}:${env}:${limit}`;

	return queryWithCache({
		key: cacheKey,
		ttl: TOP_EVENT_NAMES_CACHE_TTL,
		fn: async () => {
			const ch = getClickhouseClient();

			const query = `
				SELECT count(*) as count, event_name
				FROM events
				WHERE org_id = {org_id:String}
					AND env = {env:String}
					AND timestamp >= NOW() - INTERVAL 1 MONTH
				GROUP BY event_name
				ORDER BY count(*) DESC
				LIMIT {limit:UInt32}
			`;

			ctx.logger.debug("Querying top event names", {
				orgId: org.id,
				env,
				limit,
			});

			const startTime = performance.now();
			const result = await ch.query({
				query,
				query_params: {
					org_id: org.id,
					env,
					limit,
				},
				format: "JSON",
			});

			const resultJson = (await result.json()) as { data: TopEventNameRow[] };
			const eventNames = resultJson.data.map((row) => row.event_name);
			const queryDuration = performance.now() - startTime;

			ctx.logger.debug("Top event names result", {
				queryMs: Math.round(queryDuration),
				count: eventNames.length,
				eventNames,
			});

			return {
				eventNames,
				result: resultJson,
			};
		},
	});
};
