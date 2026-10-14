import type { AplQuery, AplQueryContext, AplRow } from "./types/aplQuery.js";

export const queryApl = async ({
	ctx,
	query,
}: {
	ctx: AplQueryContext;
	query: AplQuery;
}): Promise<AplRow[]> => {
	const result = await ctx.axiom.api.query(query.apl, {
		startTime: query.startTime,
		endTime: query.endTime,
		format: "tabular",
	});

	return result.tables.flatMap((table) => [...table.events()]);
};
