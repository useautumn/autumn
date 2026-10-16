import type {
	GetAtomMetricsParams,
	GetAtomMetricsResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import { queryAtomMetrics } from "./atomLogs/queryAtomMetrics.js";

/** An Atom's CPU, memory and traffic over the range, for its Monitoring charts. */
export const getAtomMetrics = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetAtomMetricsParams;
}): Promise<GetAtomMetricsResponse> => {
	const cacheDeployment = await cacheDeploymentRepo.find({
		ctx,
		atomId: params.atom_id,
	});
	if (!cacheDeployment?.deployment_id)
		return { period_seconds: 0, points: [], latest: null };
	return queryAtomMetrics({
		deploymentId: cacheDeployment.deployment_id,
		range: params.range,
		createdAt: cacheDeployment.created_at,
	});
};
