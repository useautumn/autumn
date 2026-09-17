import type { LeanCustomerEntitlement } from "@autumn/balance-engine";
import { type ApiBalanceV1, ApiBalanceV1Schema } from "@autumn/shared";

export function meteringBalanceToApiBalance({
	featureId,
	snapshot,
}: {
	featureId: string;
	snapshot: LeanCustomerEntitlement;
}): ApiBalanceV1 {
	return ApiBalanceV1Schema.parse({
		object: "balance",
		feature_id: featureId,
		granted: snapshot.granted,
		remaining: Math.max(0, snapshot.balance),
		usage: snapshot.usage,
		unlimited: false,
		overage_allowed: false,
		max_purchase: null,
		next_reset_at: snapshot.reset?.nextResetAt ?? null,
		breakdown: [
			{
				object: "balance_breakdown",
				id: snapshot.externalId ?? snapshot.id,
				plan_id: snapshot.planId,
				included_grant: snapshot.granted,
				prepaid_grant: 0,
				remaining: snapshot.balance,
				usage: snapshot.usage,
				unlimited: false,
				reset: snapshot.reset
					? {
							interval: snapshot.reset.interval,
							interval_count:
								snapshot.reset.intervalCount === 1
									? undefined
									: snapshot.reset.intervalCount,
							resets_at: snapshot.reset.nextResetAt,
						}
					: null,
				price: null,
				expires_at: snapshot.expiresAt,
				overage: Math.max(0, -snapshot.balance),
			},
		],
	});
}
