import { isDeepStrictEqual } from "node:util";
import { orgToCacheDeployment } from "@autumn/byoc";
import {
	type ByocCacheDeployment,
	type ByocCacheMachine,
	type ByocCacheNetwork,
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
	cacheNames,
	resourcesToMachine,
} from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";
import { startCacheDeploymentWatch } from "./watchCacheDeployment/startCacheDeploymentWatch.js";

/** What a setup asks the org's cloud for. */
type CacheSetupSettings = {
	machine: ByocCacheMachine;
	region: string | null;
	network: ByocCacheNetwork | null;
};

/** A named setting wins; a fresh link for a waiting setup keeps what it asked for; otherwise the default. */
const setupSettings = ({
	params: { cpu, memory, region, network },
	existing,
}: {
	params: CreateByocCacheParams;
	existing: ByocCacheDeployment | null;
}): CacheSetupSettings => {
	const askedMachine =
		existing && cacheDeploymentToMachine({ cacheDeployment: existing });
	const namedMachine =
		cpu !== undefined && memory !== undefined
			? resourcesToMachine({ cpu, memory })
			: null;
	return {
		machine: namedMachine ?? askedMachine ?? DEFAULT_BYOC_CACHE_MACHINE,
		region: region ?? existing?.region ?? null,
		network: network ?? existing?.network ?? null,
	};
};

/** Holds the env's slot for this deployment group, or returns whoever claimed it first. */
const claimCacheDeployment = async ({
	ctx,
	deploymentGroupId,
	token,
	settings: { machine, region, network },
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
	token: string;
	settings: CacheSetupSettings;
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
		region,
		network,
	};
	if (await insertCacheDeployment({ ctx, cacheDeployment }))
		return cacheDeployment;
	const winner = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
	return (
		(winner && orgToCacheDeployment({ org: winner, env: ctx.env })) ??
		cacheDeployment
	);
};

/** A fresh link moves the record to the group it landed in (the org's external id changed) and the settings it asks for; token kept. */
const followSetup = async ({
	ctx,
	existing,
	deploymentGroupId,
	settings: { machine, region, network },
}: {
	ctx: AutumnContext;
	existing: ByocCacheDeployment;
	deploymentGroupId: string;
	settings: CacheSetupSettings;
}): Promise<ByocCacheDeployment> => {
	const sameGroup = existing.deployment_group_id === deploymentGroupId;
	const sameMachine =
		existing.cpu === machine.cpu && existing.memory === machine.memory;
	const sameRegion = (existing.region ?? null) === region;
	const sameNetwork = isDeepStrictEqual(existing.network ?? null, network);
	if (sameGroup && sameMachine && sameRegion && sameNetwork) return existing;
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
	const settings = setupSettings({ params, existing });
	const setup = await getAtomDeployer().start({
		names: cacheNames({ org, env }),
		auth: { mode: "deployed", tokenHash: atomTokenToHash({ token }) },
		machine: settings.machine,
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
		env,
		setupUrl: setup.setupUrl,
	});
};
