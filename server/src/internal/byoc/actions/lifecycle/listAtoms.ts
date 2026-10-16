import type { ListByocAtomsResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import {
	cacheDeploymentToApiCache,
	cacheOwner,
	MAX_ATOMS_PER_ENV,
	nextAtomStackName,
} from "../../utils/byocCacheUtils.js";
import { isCacheBeingRemoved } from "../../utils/classifyCacheDeployment.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** Every Atom the env has, as alien has them now: those it runs, those still coming down, and the stack name the next one takes. */
export const listAtoms = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ListByocAtomsResponse> => {
	const { org, env } = ctx;
	const [active, removing] = await Promise.all([
		cacheDeploymentRepo.findActive({ ctx }),
		cacheDeploymentRepo.findRemoving({ ctx }),
	]);
	const rows = [...active, ...removing];
	const refreshed = (
		await Promise.all(
			rows.map((row) => refreshCacheDeployment({ ctx, cacheDeployment: row })),
		)
	)
		.filter((row) => row !== null)
		.map((cacheDeployment) =>
			cacheDeploymentToApiCache({ cacheDeployment, org }),
		);
	const next = nextAtomStackName({
		owner: cacheOwner({ org, env }),
		existingAtomIds: rows.map(({ id }) => id),
	});
	return {
		atoms: refreshed.filter(
			(cacheDeployment) => !isCacheBeingRemoved({ cacheDeployment }),
		),
		removing: refreshed.filter((cacheDeployment) =>
			isCacheBeingRemoved({ cacheDeployment }),
		),
		next_stack_name: next.stackName,
		next_stack_name_suffix: next.suffix,
		max_atoms: MAX_ATOMS_PER_ENV,
	};
};
