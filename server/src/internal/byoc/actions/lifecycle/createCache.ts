import { isDeepStrictEqual } from "node:util";
import {
	type ByocCacheDeployment,
	type ByocCacheMachine,
	type ByocCacheNetwork,
	ByocCacheStatus,
	type CreateByocCacheParams,
	type CreateByocCacheResponse,
	DEFAULT_BYOC_CACHE_AWS_REGION,
	DEFAULT_BYOC_CACHE_MACHINE,
} from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { getAtomDeployer } from "../../deployers/getAtomDeployer.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import {
	atomTokenToHash,
	cacheDeploymentToAtomToken,
	generateAtomToken,
} from "../../utils/atomTokenUtils.js";
import {
	CACHE_LOCK_TTL_MS,
	cacheDeploymentToCreateResponse,
	cacheDeploymentToMachine,
	cacheLockKey,
	cacheNames,
	cacheStackName,
	nextCacheAtomId,
	resourcesToMachine,
} from "../../utils/byocCacheUtils.js";
import { toCacheStages } from "../../utils/cacheStageUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";
import { startCacheDeploymentWatch } from "./startCacheDeploymentWatch.js";

/** What a setup asks the org's cloud for. */
type CacheSetupSettings = {
	machine: ByocCacheMachine;
	region: string;
	network: ByocCacheNetwork | null;
	stackName: string;
};

/** A named setting wins; a fresh link for a waiting setup keeps what it asked for; otherwise the default. */
const setupSettings = ({
	ctx: { org, env },
	params: { cpu, memory, region, network, stack_name },
	existing,
	atomId,
}: {
	ctx: AutumnContext;
	params: CreateByocCacheParams;
	existing: ByocCacheDeployment | null;
	atomId: string;
}): CacheSetupSettings => {
	const askedMachine =
		existing && cacheDeploymentToMachine({ cacheDeployment: existing });
	const namedMachine =
		cpu !== undefined && memory !== undefined
			? resourcesToMachine({ cpu, memory })
			: null;
	return {
		machine: namedMachine ?? askedMachine ?? DEFAULT_BYOC_CACHE_MACHINE,
		region: region ?? existing?.region ?? DEFAULT_BYOC_CACHE_AWS_REGION,
		network: network ?? existing?.network ?? null,
		stackName: stack_name
			? cacheStackName({ org, env, atomId, base: stack_name })
			: (existing?.stack_name ?? cacheStackName({ org, env, atomId })),
	};
};

/** Holds the env's slot for this deployment group, or returns whoever claimed it first. */
const claimCacheDeployment = async ({
	ctx,
	atomId,
	deploymentGroupId,
	token,
	settings: { machine, region, network, stackName },
}: {
	ctx: AutumnContext;
	atomId: string;
	deploymentGroupId: string;
	token: string;
	settings: CacheSetupSettings;
}): Promise<ByocCacheDeployment> => {
	const status = ByocCacheStatus.AwaitingSetup;
	const cacheDeployment: ByocCacheDeployment = {
		id: atomId,
		org_id: ctx.org.id,
		env: ctx.env,
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status,
		endpoint_url: null,
		cpu: machine.cpu,
		memory: machine.memory,
		encrypted_token: encryptData(token),
		token_hash: atomTokenToHash({ token }),
		region,
		network,
		stack_name: stackName,
		stages: toCacheStages({ doneStages: [], status }),
		error: null,
		first_check_at: null,
		created_at: Date.now(),
	};
	if (await cacheDeploymentRepo.insert({ ctx, cacheDeployment }))
		return cacheDeployment;
	return (await cacheDeploymentRepo.find({ ctx })) ?? cacheDeployment;
};

/** A fresh link moves the record to the group it landed in (the org's external id changed) and the settings it asks for; token kept. */
const followSetup = async ({
	ctx,
	existing,
	deploymentGroupId,
	settings: { machine, region, network, stackName },
}: {
	ctx: AutumnContext;
	existing: ByocCacheDeployment;
	deploymentGroupId: string;
	settings: CacheSetupSettings;
}): Promise<ByocCacheDeployment> => {
	const sameGroup = existing.deployment_group_id === deploymentGroupId;
	const sameMachine =
		existing.cpu === machine.cpu && existing.memory === machine.memory;
	const sameRegion = existing.region === region;
	const sameNetwork = isDeepStrictEqual(existing.network, network);
	const sameStackName = existing.stack_name === stackName;
	if (sameGroup && sameMachine && sameRegion && sameNetwork && sameStackName)
		return existing;
	const moved: ByocCacheDeployment = {
		...existing,
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status: ByocCacheStatus.AwaitingSetup,
		endpoint_url: null,
		cpu: machine.cpu,
		memory: machine.memory,
		region,
		network,
		stack_name: stackName,
	};
	await cacheDeploymentRepo.update({ ctx, from: existing, to: moved });
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
			"Atom setup is already in progress, try again in a few seconds",
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
	const existing = await cacheDeploymentRepo.find({ ctx });
	const isAwaitingSetup = existing?.status === ByocCacheStatus.AwaitingSetup;
	if (existing && !isAwaitingSetup)
		return cacheDeploymentToCreateResponse({
			cacheDeployment: existing,
			org,
			setupUrl: null,
		});
	// Atoms still being removed keep their own groups and stacks; a new one is named apart from them.
	const atomId =
		existing?.id ??
		nextCacheAtomId({
			org,
			env,
			existingAtomIds: (await cacheDeploymentRepo.findRemoving({ ctx })).map(
				({ id }) => id,
			),
		});

	// A setup that is still waiting keeps its token, so a fresh link starts the same Atom.
	const token = existing
		? cacheDeploymentToAtomToken({ cacheDeployment: existing })
		: generateAtomToken();
	const settings = setupSettings({ ctx, params, existing, atomId });
	const setup = await getAtomDeployer().start({
		names: cacheNames({ org, env, atomId, stackName: settings.stackName }),
		auth: { mode: "deployed", tokenHash: atomTokenToHash({ token }) },
		machine: settings.machine,
		region: settings.region,
		network: settings.network,
	});
	const claimed = existing
		? await followSetup({
				ctx,
				existing,
				deploymentGroupId: setup.deploymentGroupId,
				settings,
			})
		: await claimCacheDeployment({
				ctx,
				atomId,
				deploymentGroupId: setup.deploymentGroupId,
				token,
				settings,
			});
	const cacheDeployment =
		(await refreshCacheDeployment({ ctx, cacheDeployment: claimed })) ??
		claimed;
	await startCacheDeploymentWatch({
		ctx,
		deploymentGroupId: cacheDeployment.deployment_group_id,
	});
	return cacheDeploymentToCreateResponse({
		cacheDeployment,
		org,
		setupUrl: setup.setupUrl,
	});
};
