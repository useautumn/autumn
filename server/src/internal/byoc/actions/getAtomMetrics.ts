import type {
	GetAtomMetricsParams,
	GetAtomMetricsResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { queryAtomMetrics } from "../atomLogs/queryAtomMetrics.js";
import { findCacheDeployment } from "../repos/cacheDeployments.js";

/** The env's Atom's CPU, memory and traffic over the range, for its Monitoring charts. */
export const getAtomMetrics = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetAtomMetricsParams;
}): Promise<GetAtomMetricsResponse> => {
	const deploymentId = (await findCacheDeployment({ ctx }))?.deployment_id;
	if (!deploymentId) return { bucket_seconds: 0, points: [] };
	return queryAtomMetrics({ deploymentId, range: params.range });
};
