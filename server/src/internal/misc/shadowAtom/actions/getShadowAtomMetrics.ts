import type {
	GetAtomMetricsParams,
	GetAtomMetricsResponse,
} from "@autumn/shared";
import { queryAtomMetrics } from "@/internal/byoc/actions/telemetry/atomLogs/queryAtomMetrics.js";
import { findShadowAtomRecords } from "../shadowAtomStorage.js";

/** Our shadow Atom's CPU, memory and traffic over the range, from the same health lines an org's Atom logs. */
export const getShadowAtomMetrics = async ({
	params,
}: {
	params: GetAtomMetricsParams;
}): Promise<GetAtomMetricsResponse> => {
	const { current } = await findShadowAtomRecords();
	if (!current?.deployment_id)
		return { period_seconds: 0, points: [], latest: null, volumes: [] };
	return queryAtomMetrics({
		deploymentId: current.deployment_id,
		range: params.range,
		createdAt: current.created_at,
	});
};
