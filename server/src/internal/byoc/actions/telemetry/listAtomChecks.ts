import type { ListAtomChecksResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import { queryRecentAtomChecks } from "./atomLogs/queryRecentAtomChecks.js";

/** An Atom's latest checks, for setup to show the org's first ones arriving. */
export const listAtomChecks = async ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}): Promise<ListAtomChecksResponse> => {
	const cacheDeployment = await cacheDeploymentRepo.find({ ctx, atomId });
	if (!cacheDeployment?.deployment_id) return { checks: [] };
	return {
		checks: await queryRecentAtomChecks({
			deploymentId: cacheDeployment.deployment_id,
		}),
	};
};
