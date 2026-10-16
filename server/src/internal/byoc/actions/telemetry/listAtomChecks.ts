import type { ListAtomChecksResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import { queryAtomFirstCheckSeenAt } from "./atomLogs/queryAtomFirstCheckSeenAt.js";
import { queryRecentAtomChecks } from "./atomLogs/queryRecentAtomChecks.js";

/** Whether an Atom has seen the org's first check, held once it has, and a sample of its latest checks until then. */
export const listAtomChecks = async ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}): Promise<ListAtomChecksResponse> => {
	const cacheDeployment = await cacheDeploymentRepo.find({ ctx, atomId });
	if (!cacheDeployment?.deployment_id)
		return { first_check_seen_at: null, checks: [] };
	if (cacheDeployment.first_check_seen_at !== null)
		return {
			first_check_seen_at: cacheDeployment.first_check_seen_at,
			checks: [],
		};

	const query = {
		deploymentId: cacheDeployment.deployment_id,
		since: cacheDeployment.created_at,
	};
	const [firstCheckSeenAt, checks] = await Promise.all([
		queryAtomFirstCheckSeenAt(query),
		queryRecentAtomChecks(query),
	]);
	if (firstCheckSeenAt !== null)
		await cacheDeploymentRepo.setFirstCheckSeenAt({
			ctx,
			cacheDeployment,
			firstCheckSeenAt,
		});
	return { first_check_seen_at: firstCheckSeenAt, checks };
};
