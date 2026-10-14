import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { queryLogsAxiom } from "../queryLogsAxiom.js";
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
	const apl = buildRequestLogsApl({
		ctx,
		query,
		limit,
		allowedStages: ["where", "orderBy", "limit"],
		appendDefaultOrder: true,
	});

	const result = await queryLogsAxiom({
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
