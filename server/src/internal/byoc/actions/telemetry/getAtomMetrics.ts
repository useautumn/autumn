import type {
	GetAtomMetricsParams,
	GetAtomMetricsResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import { queryAtomMetrics } from "./atomLogs/queryAtomMetrics.js";

/** The env's Atom's CPU, memory and traffic over the range, for its Monitoring charts. */
export const getAtomMetrics = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetAtomMetricsParams;
}): Promise<GetAtomMetricsResponse> => {
	const deploymentId = (await cacheDeploymentRepo.find({ ctx }))?.deployment_id;
	if (!deploymentId) return { bucket_seconds: 0, points: [] };
	return queryAtomMetrics({ deploymentId, range: params.range });
};
