import { createHash } from "node:crypto";
import { toDeploymentGroupName } from "@autumn/alien";
import { SHADOW_ATOM_EXTERNAL_ID } from "@autumn/edge-config";
import {
	type ApiByocCache,
	type AppEnv,
	type ByocCacheDeployment,
	type ByocCacheMachine,
	type CreateByocCacheResponse,
	ErrCode,
	findByocCacheMachine,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentToAtomToken } from "./atomTokenUtils.js";

/** A dev stack's name goes in front, so two worktrees can hold the same org on alien at once; only `scripts/dev.ts` sets it. */
const cacheNamePrefix = (): string | null =>
	process.env.ATOM_DEPLOYMENT_PREFIX?.trim() || null;

/** What alien accepts as a deployment group's external id. */
const ALIEN_EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/** Joins an external id from its parts and refuses one alien would reject, so a bad id fails here and not as a 503. */
export const toAlienExternalId = ({ parts }: { parts: string[] }): string => {
	const externalId = [cacheNamePrefix(), ...parts].filter(Boolean).join(".");
	if (!ALIEN_EXTERNAL_ID.test(externalId))
		throw new Error(`"${externalId}" is not a valid alien external id`);
	return externalId;
};

/** One Atom, as its deployer knows it: one deployment group each, so an Atom being removed never shares a group with its replacement. Records from before Atom ids keep `<org>.<env>`. */
export const cacheExternalId = ({
	org,
	env,
	atomId,
}: {
	org: Pick<Organization, "id">;
	env: AppEnv;
	atomId?: string;
}) =>
	toAlienExternalId({
		parts: [org.id, env, atomId].filter((part) => part !== undefined),
	});

/** The id the env's next Atom takes, fixed by the Atoms it has, so the page can show its stack name before it exists. */
export const nextCacheAtomId = ({
	org,
	env,
	existingAtomIds,
}: {
	org: Pick<Organization, "id">;
	env: AppEnv;
	existingAtomIds: string[];
}) =>
	`atom_${createHash("sha256")
		.update([org.id, env, ...[...existingAtomIds].sort()].join("."))
		.digest("hex")
		.slice(0, 24)}`;

/** The label records made before stack names could be chosen were set up under. */
export const cacheGroupLabel = ({
	org,
	env,
}: {
	org: Pick<Organization, "slug">;
	env: AppEnv;
}) =>
	[cacheNamePrefix(), "autumn-byoc", org.slug, env].filter(Boolean).join("-");

/** Six hex chars of the external id, so every Atom, and every dev stack, names its stack apart. */
export const cacheStackNameSuffix = ({
	org,
	env,
	atomId,
}: {
	org: Pick<Organization, "id">;
	env: AppEnv;
	atomId?: string;
}) =>
	createHash("sha256")
		.update(cacheExternalId({ org, env, atomId }))
		.digest("hex")
		.slice(0, 6);

/** The stack's name in the org's cloud, which is also its deployment group's: the chosen base, or `atom-<slug>-<env>`, then the suffix. */
export const cacheStackName = ({
	org,
	env,
	atomId,
	base,
}: {
	org: Pick<Organization, "id" | "slug">;
	env: AppEnv;
	atomId?: string;
	base?: string;
}) =>
	toDeploymentGroupName({
		label: [
			base ?? `atom-${org.slug}-${env}`,
			cacheStackNameSuffix({ org, env, atomId }),
		].join("-"),
	});

/** A record from before stack names were stored keeps the name it was set up under. */
export const cacheDeploymentStackName = ({
	cacheDeployment,
	org,
}: {
	cacheDeployment: ByocCacheDeployment;
	org: Pick<Organization, "slug">;
}) =>
	cacheDeployment.stack_name ??
	toDeploymentGroupName({
		label: cacheGroupLabel({ org, env: cacheDeployment.env }),
	});

/** An Atom's names, as `createCache` starts it. */
export const cacheNames = ({
	org,
	env,
	atomId,
	stackName = cacheStackName({ org, env, atomId }),
}: {
	org: Organization;
	env: AppEnv;
	atomId?: string;
	stackName?: string;
}) => ({
	externalId: cacheExternalId({ org, env, atomId }),
	label: stackName,
});

/** Our one shadow Atom's names. An org's external id always holds `.<env>` and its label ends in a hash suffix, so neither can match. */
export const shadowAtomCacheNames = () => ({
	externalId: toAlienExternalId({ parts: [SHADOW_ATOM_EXTERNAL_ID] }),
	label: [cacheNamePrefix(), SHADOW_ATOM_EXTERNAL_ID].filter(Boolean).join("-"),
});

/** Outlasts the few alien calls a setup makes; a crashed holder frees the env after this. */
export const CACHE_LOCK_TTL_MS = 30_000;

/** The request schemas only let offered pairs through, so a miss here is a contract bug. */
export const resourcesToMachine = ({
	cpu,
	memory,
}: {
	cpu: number;
	memory: number;
}): ByocCacheMachine => {
	const machine = findByocCacheMachine({ cpu, memory });
	if (machine) return machine;
	throw new RecaseError({
		message: `No Atom machine has ${cpu} vCPU / ${memory} GiB`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const cacheDeploymentToMachine = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}): ByocCacheMachine | null => {
	const { cpu, memory } = cacheDeployment;
	if (cpu === null || memory === null) return null;
	return findByocCacheMachine({ cpu, memory }) ?? null;
};

/** A resize moves a running cache; one still being set up takes its machine from `create_atom`. */
export const cacheNotRunning = () =>
	new RecaseError({
		message: "Atom is not running yet, so it cannot be resized.",
		code: ErrCode.ByocCacheNotReady,
		statusCode: 409,
	});

/** Only a deploy that stopped can be resumed. */
export const cacheNotFailed = () =>
	new RecaseError({
		message: "Atom's deploy has not failed, so there is nothing to retry.",
		code: ErrCode.InvalidRequest,
		statusCode: 409,
	});

/** One cache change per env at a time. */
export const cacheLockKey = ({ ctx }: { ctx: AutumnContext }) =>
	`lock:byoc-cache:${ctx.org.id}:${ctx.env}`;

export const cacheDeploymentToApiCache = ({
	cacheDeployment,
	org,
}: {
	cacheDeployment: ByocCacheDeployment;
	org: Pick<Organization, "slug">;
}): ApiByocCache => ({
	id: cacheDeployment.id,
	env: cacheDeployment.env,
	stack_name: cacheDeploymentStackName({ cacheDeployment, org }),
	status: cacheDeployment.status,
	deployment_id: cacheDeployment.deployment_id,
	endpoint_url: cacheDeployment.endpoint_url,
	created_at: cacheDeployment.created_at,
	first_check_at: cacheDeployment.first_check_at,
	cpu: cacheDeployment.cpu,
	memory: cacheDeployment.memory,
	region: cacheDeployment.region,
	network: cacheDeployment.network,
	stages: cacheDeployment.stages,
	error: cacheDeployment.error,
});

/** Only a create hands out the token, so reading a cache never reveals it. */
export const cacheDeploymentToCreateResponse = ({
	cacheDeployment,
	org,
	setupUrl,
}: {
	cacheDeployment: ByocCacheDeployment;
	org: Pick<Organization, "slug">;
	setupUrl: string | null;
}): CreateByocCacheResponse => ({
	...cacheDeploymentToApiCache({ cacheDeployment, org }),
	setup_url: setupUrl,
	token: cacheDeploymentToAtomToken({ cacheDeployment }),
});
