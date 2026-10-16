import type { AtomAccess } from "@autumn/billing";
import { requestFeatureAccess } from "@/external/autumn/requestFeatureAccess.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";

/** The env's Atom access, counted against the Atoms it runs now. */
export const readAtomAccess = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<AtomAccess> =>
	requestFeatureAccess({ ctx }).atoms({
		orgId: ctx.org.id,
		countActive: async () =>
			(await cacheDeploymentRepo.findActive({ ctx })).length,
	});
