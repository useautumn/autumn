import type { ListAtomChecksResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { queryRecentAtomChecks } from "../atomLogs/queryRecentAtomChecks.js";
import { cacheDeploymentRepo } from "../repos/index.js";

/** The env's Atom's latest checks, for setup to show the org's first ones arriving; the first seen marks setup done. */
export const listAtomChecks = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ListAtomChecksResponse> => {
	const cacheDeployment = await cacheDeploymentRepo.find({ ctx });
	if (!cacheDeployment?.deployment_id) return { checks: [] };

	const checks = await queryRecentAtomChecks({
		deploymentId: cacheDeployment.deployment_id,
	});
	const firstCheck = checks.at(-1);
	if (firstCheck && cacheDeployment.first_check_at === null)
		await cacheDeploymentRepo.setFirstCheckAt({
			ctx,
			cacheDeployment,
			firstCheckAt: firstCheck.at,
		});
	return { checks };
};
