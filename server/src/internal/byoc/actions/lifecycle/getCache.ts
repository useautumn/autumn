import type { GetByocCacheResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import {
	atomStackNameSuffix,
	cacheDeploymentStackName,
	cacheDeploymentToApiCache,
	cacheOwner,
	nextAtomStackName,
} from "../../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** One Atom (the env's only one when none is named) and any earlier ones still coming down, as alien has them now, and the stack name it (or the next one) takes. */
export const getCache = async ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}): Promise<GetByocCacheResponse> => {
	const { org, env } = ctx;
	const [existing, active, removingRows] = await Promise.all([
		cacheDeploymentRepo.find({ ctx, atomId }),
		cacheDeploymentRepo.findActive({ ctx }),
		cacheDeploymentRepo.findRemoving({ ctx }),
	]);
	const [cacheDeployment, ...removing] = await Promise.all(
		[existing, ...removingRows].map(
			(row) => row && refreshCacheDeployment({ ctx, cacheDeployment: row }),
		),
	);
	const owner = cacheOwner({ org, env });
	const next = nextAtomStackName({
		owner,
		existingAtomIds: [...active, ...removingRows].map(({ id }) => id),
	});
	return {
		cache: cacheDeployment
			? cacheDeploymentToApiCache({ cacheDeployment, org })
			: null,
		removing: removing
			.filter((row) => row !== null)
			.map((row) => cacheDeploymentToApiCache({ cacheDeployment: row, org })),
		stack_name: existing
			? cacheDeploymentStackName({ cacheDeployment: existing, org })
			: next.stackName,
		stack_name_suffix: existing
			? atomStackNameSuffix({ owner, atomId: existing.id })
			: next.suffix,
	};
};
