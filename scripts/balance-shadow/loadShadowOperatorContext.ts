import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { logger } from "@server/external/logtail/logtailUtils.js";
import { getCtxWithCustomerRedis } from "@server/external/redis/customerRedisRouting.js";
import { resolveRedisV2 } from "@server/external/redis/resolveRedisV2.js";
import type { AutumnContext } from "@server/honoUtils/HonoEnv.js";
import type { BalanceShadowCustomer } from "@server/internal/balances/shadow/operator/runBalanceShadowCohort.js";
import { computeRolloutSnapshot } from "@server/internal/misc/rollouts/rolloutUtils.js";
import { OrgService } from "@server/internal/orgs/OrgService.js";

export async function loadShadowOperatorContext({
	db,
	customer,
}: {
	db: DrizzleCli;
	customer: BalanceShadowCustomer;
}): Promise<AutumnContext> {
	const env = customer.env === "live" ? AppEnv.Live : AppEnv.Sandbox;
	const data = await OrgService.getWithFeatures({
		db,
		orgId: customer.orgId,
		env,
	});
	if (!data) throw new Error("Cohort organization not found");
	const ctx: AutumnContext = {
		org: data.org,
		features: data.features,
		env,
		db,
		dbGeneral: db,
		logger,
		redisV2: resolveRedisV2({ customerId: customer.customerId }),
		id: `shadow-operator-${crypto.randomUUID()}`,
		timestamp: Date.now(),
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		isPublic: false,
		authType: AuthType.Unknown,
		expand: [],
		scopes: [],
		skipCache: false,
		extraLogs: {},
		rolloutSnapshot: computeRolloutSnapshot({ orgId: customer.orgId }),
	};
	return getCtxWithCustomerRedis({ ctx, customerId: customer.customerId }).ctx;
}
