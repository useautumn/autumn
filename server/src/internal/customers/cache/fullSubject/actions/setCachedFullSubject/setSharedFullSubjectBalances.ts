import type { NormalizedFullSubject } from "@autumn/shared";
import type { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { featureBalancesToHashFields } from "../../balances/featureBalancesToHashFields.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";

type SharedBalanceWrite = {
	balanceKey: string;
	fields: Record<string, string>;
};

const buildSharedBalanceWrites = ({
	orgId,
	env,
	customerId,
	customerEntitlements,
}: {
	orgId: string;
	env: string;
	customerId: string;
	customerEntitlements: NormalizedFullSubject["customer_entitlements"];
}): SharedBalanceWrite[] => {
	const balancesByFeatureId = new Map<string, typeof customerEntitlements>();

	for (const customerEntitlement of customerEntitlements) {
		const existingBalances =
			balancesByFeatureId.get(customerEntitlement.feature_id) ?? [];
		existingBalances.push(customerEntitlement);
		balancesByFeatureId.set(customerEntitlement.feature_id, existingBalances);
	}

	return Array.from(balancesByFeatureId.entries()).map(
		([featureId, balances]) => {
			return {
				balanceKey: buildSharedFullSubjectBalanceKey({
					orgId,
					env,
					customerId,
					featureId,
				}),
				fields: featureBalancesToHashFields({ balances }),
			};
		},
	);
};

export const appendSharedFullSubjectBalanceWrite = async ({
	ctx,
	multi,
	normalized,
	meteredFeatures: _meteredFeatures,
	overwrite: _overwrite,
	ttlSeconds,
}: {
	ctx: AutumnContext;
	multi: ReturnType<typeof redisV2.multi>;
	normalized: NormalizedFullSubject;
	meteredFeatures: string[];
	overwrite: boolean;
	ttlSeconds: number;
}) => {
	const { org, env } = ctx;
	const { customerId } = normalized;
	const balanceWrites = buildSharedBalanceWrites({
		orgId: org.id,
		env,
		customerId,
		customerEntitlements: normalized.customer_entitlements,
	});

	for (const { balanceKey, fields } of balanceWrites) {
		if (Object.keys(fields).length > 0) {
			multi.hset(balanceKey, fields);
		}

		multi.expire(balanceKey, ttlSeconds);
	}
};
