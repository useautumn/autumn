import {
	type ByocCacheDeployment,
	ByocCacheStage,
	ByocCacheStatus,
	DEFAULT_BYOC_CACHE_MACHINE,
} from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { waitForRedisReady } from "@/external/redis/initUtils/redisWarmup.js";
import { getMiscRedis } from "@/external/redis/miscCache/getMiscRedis.js";
import { cacheDeploymentRepo } from "@/internal/byoc/repos/cacheDeploymentRepo.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { deleteAtomDeployment } from "../ensureAtomDeployment.js";

/** Herald routes pushes by the cached org; a clear before Redis connects is skipped, so it waits for Redis first. */
const forgetCachedOrg = async () => {
	await waitForRedisReady(getMiscRedis(), "misc");
	await clearOrgCache({
		db: defaultCtx.db,
		orgId: defaultCtx.org.id,
		env: defaultCtx.env,
	});
};

/** The org's Atom becomes the set: a ready record at the balancer, so herald pushes there and the API knows its token. */
export const registerReplicaSet = async ({
	autumn,
	endpointUrl,
	token,
}: {
	autumn: AutumnInt;
	endpointUrl: string;
	token: string;
}): Promise<void> => {
	await deleteAtomDeployment({ autumn });
	await unregisterReplicaSet();
	const status = ByocCacheStatus.Ready;
	const cacheDeployment: ByocCacheDeployment = {
		id: generateId("atom"),
		org_id: defaultCtx.org.id,
		env: defaultCtx.env,
		name: null,
		deployment_group_id: generateId("replica_set"),
		deployment_id: generateId("replica_set_deployment"),
		status,
		endpoint_url: endpointUrl,
		cpu: DEFAULT_BYOC_CACHE_MACHINE.cpu,
		memory: DEFAULT_BYOC_CACHE_MACHINE.memory,
		encrypted_token: encryptData(token),
		token_hash: atomTokenToHash({ token }),
		region: "us-east-1",
		volume_size_gib: 20,
		network: null,
		stack_name: null,
		stages: toCacheStages({
			doneStages: Object.values(ByocCacheStage),
			status,
		}),
		error: null,
		first_check_at: null,
		first_check_seen_at: null,
		created_at: Date.now(),
	};
	if (!(await cacheDeploymentRepo.insert({ ctx: defaultCtx, cacheDeployment })))
		throw new Error("The org still holds another Atom record");
	await forgetCachedOrg();
};

/** Forgets whatever Atom record the org holds, so the next file starts from none. */
export const unregisterReplicaSet = async (): Promise<void> => {
	const cacheDeployment = await cacheDeploymentRepo.find({ ctx: defaultCtx });
	if (!cacheDeployment) return;
	await cacheDeploymentRepo.delete({ ctx: defaultCtx, cacheDeployment });
	await forgetCachedOrg();
};
