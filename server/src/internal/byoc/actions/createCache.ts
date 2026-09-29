import { orgToCacheDeployment } from "@autumn/byoc";
import {
	type ByocCacheDeployment,
	ByocCacheStatus,
	type CreateByocCacheResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { insertCacheDeployment } from "../repos/cacheDeployments.js";
import {
	cacheDeploymentToApiCache,
	cacheExternalId,
	cacheGroupLabel,
	getAlienClientOrThrow,
} from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** Holds the env's slot for this deployment group, or returns whoever claimed it first. */
const claimCacheDeployment = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): Promise<ByocCacheDeployment> => {
	const cacheDeployment: ByocCacheDeployment = {
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status: ByocCacheStatus.AwaitingSetup,
		created_at: Date.now(),
	};
	if (await insertCacheDeployment({ ctx, cacheDeployment }))
		return cacheDeployment;
	const winner = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
	return (
		(winner && orgToCacheDeployment({ org: winner, env: ctx.env })) ??
		cacheDeployment
	);
};

/** Starts the env's cache setup, or hands back a fresh setup link while it still waits on the org. */
export const createCache = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<CreateByocCacheResponse> => {
	const { org, env } = ctx;
	const existing = orgToCacheDeployment({ org, env });
	const isAwaitingSetup = existing?.status === ByocCacheStatus.AwaitingSetup;
	if (existing && !isAwaitingSetup)
		return {
			...cacheDeploymentToApiCache({ cacheDeployment: existing, env }),
			setup_url: null,
		};

	const setup = await getAlienClientOrThrow().startSetup({
		externalId: cacheExternalId({ org, env }),
		label: cacheGroupLabel({ org, env }),
	});
	const claimed =
		existing ??
		(await claimCacheDeployment({
			ctx,
			deploymentGroupId: setup.deploymentGroupId,
		}));
	const cacheDeployment = await refreshCacheDeployment({
		ctx,
		cacheDeployment: claimed,
	});
	return {
		...cacheDeploymentToApiCache({ cacheDeployment, env }),
		setup_url: setup.setupUrl,
	};
};
