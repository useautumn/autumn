import { orgToCacheDeployment } from "@autumn/byoc";
import {
	type ByocCacheDeployment,
	type ByocCacheMachine,
	ByocCacheStatus,
	type CreateByocCacheParams,
	type CreateByocCacheResponse,
	DEFAULT_BYOC_CACHE_MACHINE,
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
	cacheDeploymentToMachine,
	cacheLockKey,
	resourcesToMachine,
} from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** A named machine wins; a fresh link for a waiting setup keeps the one it asked for; otherwise the default. */
const setupMachine = ({
	params: { cpu, memory },
	existing,
}: {
	params: CreateByocCacheParams;
	existing: ByocCacheDeployment | null;
}): ByocCacheMachine => {
	if (cpu !== undefined && memory !== undefined)
		return resourcesToMachine({ cpu, memory });
	const asked =
		existing && cacheDeploymentToMachine({ cacheDeployment: existing });
	return asked ?? DEFAULT_BYOC_CACHE_MACHINE;
};

/** Holds the env's slot for this deployment group, or returns whoever claimed it first. */
const claimCacheDeployment = async ({
	ctx,
	deploymentGroupId,
	token,
	machine,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
	token: string;
	machine: ByocCacheMachine;
}): Promise<ByocCacheDeployment> => {
	const cacheDeployment: ByocCacheDeployment = {
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status: ByocCacheStatus.AwaitingSetup,
		endpoint_url: null,
		cpu: machine.cpu,
		memory: machine.memory,
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

/** A fresh link moves the record to the group it landed in (the org's external id changed) and the machine it asks for; token kept. */
const followSetup = async ({
	ctx,
	existing,
	deploymentGroupId,
	machine,
}: {
	ctx: AutumnContext;
	existing: ByocCacheDeployment;
	deploymentGroupId: string;
	machine: ByocCacheMachine;
}): Promise<ByocCacheDeployment> => {
	const sameGroup = existing.deployment_group_id === deploymentGroupId;
	const sameMachine =
		existing.cpu === machine.cpu && existing.memory === machine.memory;
	if (sameGroup && sameMachine) return existing;
	const moved: ByocCacheDeployment = {
		...existing,
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status: ByocCacheStatus.AwaitingSetup,
		endpoint_url: null,
		cpu: machine.cpu,
		memory: machine.memory,
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
	params,
}: {
	ctx: AutumnContext;
	params: CreateByocCacheParams;
}): Promise<CreateByocCacheResponse> =>
	// Each setup revokes the env's earlier links, so a concurrent one would kill this caller's link.
	withLock({
		lockKey: cacheLockKey({ ctx }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"Cache setup is already in progress, try again in a few seconds",
		fn: () => startCacheSetup({ ctx, params }),
	});

const startCacheSetup = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateByocCacheParams;
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
	const machine = setupMachine({ params, existing });
	const setup = await getAtomDeployer().start({
		org,
		env,
		tokenHash: atomTokenToHash({ token }),
		machine,
	});
	const claimed = existing
		? await followSetup({
				ctx,
				existing,
				deploymentGroupId: setup.deploymentGroupId,
				machine,
			})
		: await claimCacheDeployment({
				ctx,
				deploymentGroupId: setup.deploymentGroupId,
				token,
				machine,
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
