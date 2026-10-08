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

/** One env's Atom, as its deployer knows it: one deployment group each, so lookups never match two. */
export const cacheExternalId = ({
	org,
	env,
}: {
	org: Pick<Organization, "id">;
	env: AppEnv;
}) => toAlienExternalId({ parts: [org.id, env] });

/** The deployment group's name, which also names the org's stack in AWS. */
export const cacheGroupLabel = ({
	org,
	env,
}: {
	org: Pick<Organization, "slug">;
	env: AppEnv;
}) =>
	[cacheNamePrefix(), "autumn-byoc", org.slug, env].filter(Boolean).join("-");

/** An org's Atom names, as `createCache` starts it. */
export const cacheNames = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => ({
	externalId: cacheExternalId({ org, env }),
	label: cacheGroupLabel({ org, env }),
});

/** Our one shadow Atom's names. An org's external id always ends `.<env>` and its label reads `autumn-byoc-…`, so neither can match. */
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

/** One cache change per env at a time. */
export const cacheLockKey = ({ ctx }: { ctx: AutumnContext }) =>
	`lock:byoc-cache:${ctx.org.id}:${ctx.env}`;

export const cacheDeploymentToApiCache = ({
	cacheDeployment,
	env,
}: {
	cacheDeployment: ByocCacheDeployment;
	env: AppEnv;
}): ApiByocCache => ({
	env,
	status: cacheDeployment.status,
	deployment_id: cacheDeployment.deployment_id,
	endpoint_url: cacheDeployment.endpoint_url,
	created_at: cacheDeployment.created_at,
	cpu: cacheDeployment.cpu,
	memory: cacheDeployment.memory,
});

/** Only a create hands out the token, so reading a cache never reveals it. */
export const cacheDeploymentToCreateResponse = ({
	cacheDeployment,
	env,
	setupUrl,
}: {
	cacheDeployment: ByocCacheDeployment;
	env: AppEnv;
	setupUrl: string | null;
}): CreateByocCacheResponse => ({
	...cacheDeploymentToApiCache({ cacheDeployment, env }),
	setup_url: setupUrl,
	token: cacheDeploymentToAtomToken({ cacheDeployment }),
});
