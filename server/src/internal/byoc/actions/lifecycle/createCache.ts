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
	DEFAULT_BYOC_CACHE_VOLUME_GIB,
} from "@autumn/shared";
import { featureAccess } from "@/external/autumn/featureAccess.js";
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
	atomCreateRefused,
	atomNames,
	atomNotFound,
	atomStackName,
	CACHE_LOCK_TTL_MS,
	cacheDeploymentToCreateResponse,
	cacheDeploymentToMachine,
	cacheLockKey,
	cacheOwner,
	resourcesToMachine,
} from "../../utils/byocCacheUtils.js";
import { toCacheStages } from "../../utils/cacheStageUtils.js";
import { nextFreeAtomId } from "../../utils/nextFreeAtomId.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";
import { startCacheDeploymentWatch } from "./startCacheDeploymentWatch.js";
import { withAtomLock } from "./withAtomLock.js";

/** What a setup asks the org's cloud for. */
type CacheSetupSettings = {
	machine: ByocCacheMachine;
	volumeSizeGib: number;
	region: string;
	network: ByocCacheNetwork | null;
	stackName: string;
};

/** A named setting wins; a fresh link for a waiting setup keeps what it asked for; otherwise the default. */
const setupSettings = ({
	ctx: { org, env },
	params: { cpu, memory, volume_size_gib, region, network, stack_name },
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
		volumeSizeGib:
			volume_size_gib ??
			existing?.volume_size_gib ??
			DEFAULT_BYOC_CACHE_VOLUME_GIB,
		region: region ?? existing?.region ?? DEFAULT_BYOC_CACHE_AWS_REGION,
		network: network ?? existing?.network ?? null,
		stackName: stack_name
			? atomStackName({
					owner: cacheOwner({ org, env }),
					atomId,
					base: stack_name,
				})
			: (existing?.stack_name ??
				atomStackName({ owner: cacheOwner({ org, env }), atomId })),
	};
};

/** Holds a new Atom's id and group for it, or returns whoever claimed them first. */
const claimCacheDeployment = async ({
	ctx,
	atomId,
	name,
	deploymentGroupId,
	token,
	settings: { machine, volumeSizeGib, region, network, stackName },
}: {
	ctx: AutumnContext;
	atomId: string;
	name: string | null;
	deploymentGroupId: string;
	token: string;
	settings: CacheSetupSettings;
}): Promise<ByocCacheDeployment> => {
	const status = ByocCacheStatus.AwaitingSetup;
	const cacheDeployment: ByocCacheDeployment = {
		id: atomId,
		org_id: ctx.org.id,
		env: ctx.env,
		name,
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status,
		endpoint_url: null,
		cpu: machine.cpu,
		memory: machine.memory,
		encrypted_token: encryptData(token),
		token_hash: atomTokenToHash({ token }),
		region,
		volume_size_gib: volumeSizeGib,
		network,
		stack_name: stackName,
		stages: toCacheStages({ doneStages: [], status }),
		error: null,
		first_check_at: null,
		created_at: Date.now(),
	};
	if (await cacheDeploymentRepo.insert({ ctx, cacheDeployment }))
		return cacheDeployment;
	return (
		(await cacheDeploymentRepo.findById({ ctx, id: atomId })) ?? cacheDeployment
	);
};

/** A fresh link moves the record to the group it landed in (the org's external id changed) and the settings it asks for; token kept. */
const followSetup = async ({
	ctx,
	existing,
	deploymentGroupId,
	settings: { machine, volumeSizeGib, region, network, stackName },
}: {
	ctx: AutumnContext;
	existing: ByocCacheDeployment;
	deploymentGroupId: string;
	settings: CacheSetupSettings;
}): Promise<ByocCacheDeployment> => {
	const sameGroup = existing.deployment_group_id === deploymentGroupId;
	const sameMachine =
		existing.cpu === machine.cpu && existing.memory === machine.memory;
	const sameVolume = existing.volume_size_gib === volumeSizeGib;
	const sameRegion = existing.region === region;
	const sameNetwork = isDeepStrictEqual(existing.network, network);
	const sameStackName = existing.stack_name === stackName;
	if (
		sameGroup &&
		sameMachine &&
		sameVolume &&
		sameRegion &&
		sameNetwork &&
		sameStackName
	)
		return existing;
	const moved: ByocCacheDeployment = {
		...existing,
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status: ByocCacheStatus.AwaitingSetup,
		endpoint_url: null,
		cpu: machine.cpu,
		memory: machine.memory,
		volume_size_gib: volumeSizeGib,
		region,
		network,
		stack_name: stackName,
	};
	await cacheDeploymentRepo.update({ ctx, from: existing, to: moved });
	return moved;
};

/** Starts a new Atom's setup, or with `atom_id` hands back a fresh setup link while that Atom still waits on the org. */
export const createCache = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateByocCacheParams;
}): Promise<CreateByocCacheResponse> => {
	if (params.atom_id)
		return withAtomLock({
			ctx,
			atomId: params.atom_id,
			fn: (existing) => renewCacheSetup({ ctx, params, existing }),
		});
	// Each new Atom takes the next id free of the env's others and counts against its limit, so two creates at once would race on both.
	return withLock({
		lockKey: cacheLockKey({ ctx }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"Atom setup is already in progress, try again in a few seconds",
		fn: () => startNewCache({ ctx, params }),
	});
};

const startNewCache = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateByocCacheParams;
}): Promise<CreateByocCacheResponse> => {
	const { org, env } = ctx;
	const [active, removing] = await Promise.all([
		cacheDeploymentRepo.findActive({ ctx }),
		cacheDeploymentRepo.findRemoving({ ctx }),
	]);
	const limits = await featureAccess({ ctx }).getAtomLimits({
		orgId: org.id,
		activeAtoms: active.length,
	});
	if (!limits.canCreate) throw atomCreateRefused({ limits });
	// Every Atom the env has keeps its stack, as do groups that outlived theirs; a new one is named apart from all of them.
	const atomId = await nextFreeAtomId({
		owner: cacheOwner({ org, env }),
		existingAtomIds: [...active, ...removing].map(({ id }) => id),
		deployer: getAtomDeployer(),
	});
	return setUpCache({
		ctx,
		params,
		existing: null,
		atomId,
		token: generateAtomToken(),
	});
};

/** A setup that is still waiting keeps its token, so a fresh link starts the same Atom. */
const renewCacheSetup = ({
	ctx,
	params,
	existing,
}: {
	ctx: AutumnContext;
	params: CreateByocCacheParams;
	existing: ByocCacheDeployment | null;
}): Promise<CreateByocCacheResponse> => {
	if (!existing) throw atomNotFound({ atomId: params.atom_id ?? "" });
	if (existing.status !== ByocCacheStatus.AwaitingSetup)
		return Promise.resolve(
			cacheDeploymentToCreateResponse({
				cacheDeployment: existing,
				org: ctx.org,
				setupUrl: null,
			}),
		);
	return setUpCache({
		ctx,
		params,
		existing,
		atomId: existing.id,
		token: cacheDeploymentToAtomToken({ cacheDeployment: existing }),
	});
};

const setUpCache = async ({
	ctx,
	params,
	existing,
	atomId,
	token,
}: {
	ctx: AutumnContext;
	params: CreateByocCacheParams;
	existing: ByocCacheDeployment | null;
	atomId: string;
	token: string;
}): Promise<CreateByocCacheResponse> => {
	const { org, env } = ctx;
	const settings = setupSettings({ ctx, params, existing, atomId });
	const setup = await getAtomDeployer().start({
		names: atomNames({
			owner: cacheOwner({ org, env }),
			atomId,
			stackName: settings.stackName,
		}),
		auth: { mode: "deployed", tokenHash: atomTokenToHash({ token }) },
		machine: settings.machine,
		volumeSizeGib: settings.volumeSizeGib,
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
				name: params.name ?? null,
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
