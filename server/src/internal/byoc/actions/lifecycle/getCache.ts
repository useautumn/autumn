import type { GetByocCacheResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/index.js";
import {
	cacheDeploymentStackName,
	cacheDeploymentToApiCache,
	cacheStackName,
	cacheStackNameSuffix,
	nextCacheAtomId,
} from "../../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** The env's Atom and any earlier ones still coming down, as alien has them now, and the stack name its Atom (or the next one) takes. */
export const getCache = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<GetByocCacheResponse> => {
	const { org, env } = ctx;
	const [existing, removingRows] = await Promise.all([
		cacheDeploymentRepo.find({ ctx }),
		cacheDeploymentRepo.findRemoving({ ctx }),
	]);
	const [cacheDeployment, ...removing] = await Promise.all(
		[existing, ...removingRows].map(
			(row) => row && refreshCacheDeployment({ ctx, cacheDeployment: row }),
		),
	);
	const atomId =
		existing?.id ??
		nextCacheAtomId({
			org,
			env,
			existingAtomIds: removingRows.map(({ id }) => id),
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
			: cacheStackName({ org, env, atomId }),
		stack_name_suffix: cacheStackNameSuffix({ org, env, atomId }),
	};
};
