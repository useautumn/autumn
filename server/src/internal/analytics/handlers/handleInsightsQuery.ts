import {
	AffectedResource,
	applyResponseVersionChanges,
	InsightsQueryBodySchema,
	type InsightsQueryResponse,
	InsightsQueryResponseSchema,
} from "@autumn/shared";
import { ClickHouseManager } from "../../../external/clickhouse/ClickHouseManager";
import { createRoute } from "../../../honoMiddlewares/routeHandler";

const VIRTUAL_TABLES = ["org_events_view"] as const;

export const handleInsightsQuery = createRoute({
	body: InsightsQueryBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { query } = c.req.valid("json");

		const containsVirtualTable = VIRTUAL_TABLES.some((table) =>
			query.includes(`from ${table}`),
		);

		if (containsVirtualTable) {
			return c.json(
				{
					data: null,
					error: "Virtual table not allowed in query",
				},
				400,
			);
		}

		const cleanedQuery = query.replace(
			/from\s+events/gi,
			`from org_events_view(org_id={org_id:String}, org_slug='', env={env:String})`,
		);

		const readonlyClient = await ClickHouseManager.getReadonlyClient();

		const result = await readonlyClient.query({
			query: cleanedQuery,
			query_params: {
				org_id: ctx.org.id,
				org_slug: "",
				env: ctx.env,
				limit: 1000,
			},
		});

		const resultJson = await result.json();

		const parsedResult = InsightsQueryResponseSchema.parse({
			data: resultJson,
		});

		return c.json(
			applyResponseVersionChanges<InsightsQueryResponse>({
				input: parsedResult,
				targetVersion: ctx.apiVersion,
				resource: AffectedResource.Attach,
				ctx,
			}),
		);
	},
});
