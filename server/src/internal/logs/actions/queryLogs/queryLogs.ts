import { isAxiomConfigured } from "@/external/axiom/initAxiom.js";
import { queryAxiom } from "@/external/axiom/queryAxiom.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildRequestLogsApl } from "../searchRequestLogs/buildRequestLogsApl.js";

export const queryLogs = async ({
	ctx,
	query,
	range,
	limit,
}: {
	ctx: AutumnContext;
	query: string;
	range: {
		startDate: string;
		endDate: string;
	};
	limit: number;
}) => {
	if (!isAxiomConfigured()) {
		return { list: [], unconfigured: true };
	}

	const apl = buildRequestLogsApl({
		ctx,
		query,
		limit,
		allowedStages: ["where", "summarize", "project", "orderBy", "limit"],
		appendDefaultOrder: false,
	});

	const result = await queryAxiom({
		apl,
		options: {
			startTime: range.startDate,
			endTime: range.endDate,
		},
	});

	return {
		list: (result.matches ?? []).map((match) => match.data ?? {}),
	};
};
