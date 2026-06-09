import { isAxiomConfigured } from "@/external/axiom/initAxiom.js";
import { queryAxiom } from "@/external/axiom/queryAxiom.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildRequestLogsApl } from "./buildRequestLogsApl.js";
import {
	isExternalRequestLog,
	projectRequestLog,
} from "./projectRequestLog.js";

export const searchRequestLogs = async ({
	ctx,
	query,
	range,
	limit,
}: {
	ctx: AutumnContext;
	query?: string;
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
		allowedStages: ["where", "orderBy", "limit"],
		appendDefaultOrder: true,
	});

	const result = await queryAxiom({
		apl,
		options: {
			startTime: range.startDate,
			endTime: range.endDate,
		},
	});

	return {
		list: (result.matches ?? [])
			.map(projectRequestLog)
			.filter(isExternalRequestLog)
			.slice(0, limit),
	};
};
