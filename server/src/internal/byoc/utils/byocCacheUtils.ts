import {
	type AlienClient,
	type AlienDeployment,
	hasDeploymentFailed,
	isDeploymentAwaitingSetup,
	isDeploymentRunning,
} from "@autumn/alien";
import {
	type ApiByocCache,
	type AppEnv,
	type ByocCacheDeployment,
	ByocCacheStatus,
	type ByocConfig,
	ErrCode,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { getAlienClient } from "@/external/alien/getAlienClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** alien's customer key for one env's cache: one deployment group each, so lookups never match two. */
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

export const alienDeploymentToCacheStatus = ({
	deployment,
}: {
	deployment: AlienDeployment | null;
}): ByocCacheStatus => {
	if (!deployment || isDeploymentAwaitingSetup({ deployment }))
		return ByocCacheStatus.AwaitingSetup;
	if (isDeploymentRunning({ deployment })) return ByocCacheStatus.Ready;
	if (hasDeploymentFailed({ deployment })) return ByocCacheStatus.Failed;
	return ByocCacheStatus.Provisioning;
};

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
	created_at: cacheDeployment.created_at,
});

export const getAlienClientOrThrow = (): AlienClient => {
	const alienClient = getAlienClient();
	if (alienClient) return alienClient;
	throw new RecaseError({
		message: "Cache deployments are not configured on this server.",
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
	});
};
