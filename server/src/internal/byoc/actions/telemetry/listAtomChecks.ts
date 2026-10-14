import type { ListAtomChecksResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import { queryRecentAtomChecks } from "./atomLogs/queryRecentAtomChecks.js";

export const listAtomChecks = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ListAtomChecksResponse> => {
	const cacheDeployment = await cacheDeploymentRepo.find({ ctx });
	if (!cacheDeployment?.deployment_id) return { checks: [] };
	return {
		checks: await queryRecentAtomChecks({
			deploymentId: cacheDeployment.deployment_id,
		}),
	};
};
