import { orgToCacheDeployment } from "@autumn/byoc";
import {
	type ByocCacheDeployment,
	ByocCacheStatus,
	type CreateByocCacheResponse,
} from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { getAtomDeployer } from "../deployers/getAtomDeployer.js";
import {
	insertCacheDeployment,
	updateCacheDeployment,
} from "../repos/cacheDeployments.js";
import {
	atomTokenToHash,
	cacheDeploymentToAtomToken,
	generateAtomToken,
} from "../utils/atomTokenUtils.js";
import {
	CACHE_LOCK_TTL_MS,
	cacheDeploymentToCreateResponse,
	cacheLockKey,
} from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** Holds the env's slot for this deployment group, or returns whoever claimed it first. */
const claimCacheDeployment = async ({
	ctx,
	deploymentGroupId,
	token,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
	token: string;
}): Promise<ByocCacheDeployment> => {
	const cacheDeployment: ByocCacheDeployment = {
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status: ByocCacheStatus.AwaitingSetup,
		endpoint_url: null,
		encrypted_token: encryptData(token),
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

/** A setup that landed in another group (the org's external id changed) moves the record there, token kept. */
const followSetupGroup = async ({
	ctx,
	existing,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	existing: ByocCacheDeployment;
	deploymentGroupId: string;
}): Promise<ByocCacheDeployment> => {
	if (existing.deployment_group_id === deploymentGroupId) return existing;
	const moved: ByocCacheDeployment = {
		...existing,
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status: ByocCacheStatus.AwaitingSetup,
		endpoint_url: null,
	};
	await updateCacheDeployment({
		ctx,
		cacheDeployment: moved,
		fromDeploymentGroupId: existing.deployment_group_id,
	});
	return moved;
};

/** Starts the env's cache setup, or hands back a fresh setup link while it still waits on the org. */
export const createCache = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<CreateByocCacheResponse> =>
	// Each setup revokes the env's earlier links, so a concurrent one would kill this caller's link.
	withLock({
		lockKey: cacheLockKey({ ctx }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"Cache setup is already in progress, try again in a few seconds",
		fn: () => startCacheSetup({ ctx }),
	});

const startCacheSetup = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<CreateByocCacheResponse> => {
	const { org, env } = ctx;
	const existing = orgToCacheDeployment({ org, env });
	const isAwaitingSetup = existing?.status === ByocCacheStatus.AwaitingSetup;
	if (existing && !isAwaitingSetup)
		return cacheDeploymentToCreateResponse({
			cacheDeployment: existing,
			env,
			setupUrl: null,
		});

	// A setup that is still waiting keeps its token, so a fresh link starts the same Atom.
	const token = existing
		? cacheDeploymentToAtomToken({ cacheDeployment: existing })
		: generateAtomToken();
	const setup = await getAtomDeployer().start({
		org,
		env,
		tokenHash: atomTokenToHash({ token }),
	});
	const claimed = existing
		? await followSetupGroup({
				ctx,
				existing,
				deploymentGroupId: setup.deploymentGroupId,
			})
		: await claimCacheDeployment({
				ctx,
				deploymentGroupId: setup.deploymentGroupId,
				token,
			});
	const cacheDeployment = await refreshCacheDeployment({
		ctx,
		cacheDeployment: claimed,
	});
	return cacheDeploymentToCreateResponse({
		cacheDeployment,
		env,
		setupUrl: setup.setupUrl,
	});
};
