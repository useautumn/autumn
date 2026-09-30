import type {
	ApiByocCache,
	AppEnv,
	ByocCacheDeployment,
	CreateByocCacheResponse,
	Organization,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentToAtomToken } from "./atomTokenUtils.js";

/** One env's Atom, as its deployer knows it: one deployment group each, so lookups never match two. */
export const cacheExternalId = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => `${org.id}.${env}`;

/** The deployment group's name, which also names the org's stack and its table in AWS. */
export const cacheGroupLabel = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => `autumn-byoc-${org.slug}-${env}`;

/** Outlasts the few alien calls a setup makes; a crashed holder frees the env after this. */
export const CACHE_LOCK_TTL_MS = 30_000;

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
