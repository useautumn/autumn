import type {
	GetAtomMetricsParams,
	GetAtomMetricsResponse,
} from "@autumn/shared";
import { queryAtomMetrics } from "@/internal/byoc/actions/telemetry/atomLogs/queryAtomMetrics.js";
import { shadowAtomStorage } from "../shadowAtomStorage.js";

/** Our shadow Atom's CPU, memory and traffic over the range, from the same health lines an org's Atom logs. */
export const getShadowAtomMetrics = async ({
	params,
}: {
	params: GetAtomMetricsParams;
}): Promise<GetAtomMetricsResponse> => {
	const deploymentId = (await shadowAtomStorage.find())?.deployment_id;
	if (!deploymentId) return { bucket_seconds: 0, points: [] };
	return queryAtomMetrics({ deploymentId, range: params.range });
};
