import type { ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { refreshAtomRecord } from "../../atomRecords/refreshAtomRecord.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import {
	atomTokenToHash,
	cacheDeploymentToAtomToken,
} from "../../utils/atomTokenUtils.js";
import { cacheDeploymentAtomContext } from "./cacheDeploymentAtomContext.js";

const withTokenHash = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<ByocCacheDeployment> => {
	if (cacheDeployment.token_hash) return cacheDeployment;
	const hashed = {
		...cacheDeployment,
		token_hash: atomTokenToHash({
			token: cacheDeploymentToAtomToken({ cacheDeployment }),
		}),
	};
	await cacheDeploymentRepo.update({ ctx, from: cacheDeployment, to: hashed });
	return hashed;
};

export const refreshCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<ByocCacheDeployment | null> =>
	refreshAtomRecord({
		ctx: cacheDeploymentAtomContext({
			ctx,
			deploymentGroupId: cacheDeployment.deployment_group_id,
		}),
		record: await withTokenHash({ ctx, cacheDeployment }),
	});
