import {
	type AutoTopup,
	type AutoTopupParams,
	type Customer,
	ErrCode,
	RecaseError,
	stripAutoTopupCountsForStorage,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { normalizeWindowCounter } from "@/internal/balances/autoTopUp/helpers/limits/autoTopupLimitWindowUtils.js";
import { getOrCreateAutoTopupLimitState } from "@/internal/balances/autoTopUp/helpers/limits/getOrCreateAutoTopupLimitState.js";
import { autoTopupLimitRepo } from "@/internal/balances/autoTopUp/repos";

export const validateAutoTopupPurchaseLimitCounts = ({
	autoTopups,
}: {
	autoTopups: AutoTopupParams[];
}) => {
	for (const topup of autoTopups) {
		const purchaseLimit = topup.purchase_limit;
		const count = purchaseLimit?.count;
		if (purchaseLimit == null || count === undefined) continue;

		if (count > purchaseLimit.limit) {
			throw new RecaseError({
				message: `purchase_limit.count (${count}) cannot exceed purchase_limit.limit (${purchaseLimit.limit}) for feature ${topup.feature_id}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};

export const syncAutoTopupPurchaseLimitCounts = async ({
	ctx,
	customer,
	autoTopups,
}: {
	ctx: AutumnContext;
	customer: Customer;
	autoTopups: AutoTopupParams[];
}): Promise<AutoTopup[]> => {
	validateAutoTopupPurchaseLimitCounts({ autoTopups });

	const now = Date.now();
	const customerId = customer.id || customer.internal_id;

	for (const topup of autoTopups) {
		const purchaseLimit = topup.purchase_limit;
		const count = purchaseLimit?.count;
		if (purchaseLimit == null || count === undefined) continue;

		const state = await getOrCreateAutoTopupLimitState({
			ctx,
			internalCustomerId: customer.internal_id,
			customerId,
			featureId: topup.feature_id,
			now,
		});

		const windowConfig = {
			interval: purchaseLimit.interval,
			interval_count: purchaseLimit.interval_count ?? 1,
			limit: purchaseLimit.limit,
		};

		const previousPurchaseLimit = customer.auto_topups?.find(
			(existingTopup) => existingTopup.feature_id === topup.feature_id,
		)?.purchase_limit;
		const intervalChanged =
			previousPurchaseLimit?.interval !== purchaseLimit.interval ||
			(previousPurchaseLimit?.interval_count ?? 1) !==
				(purchaseLimit.interval_count ?? 1);

		let purchaseWindowEndsAt = state.purchase_window_ends_at;
		if (intervalChanged || now >= purchaseWindowEndsAt) {
			const normalized = normalizeWindowCounter({
				now,
				windowEndsAt: intervalChanged ? now : purchaseWindowEndsAt,
				count: 0,
				windowConfig,
				from: intervalChanged ? now : purchaseWindowEndsAt,
			});
			if (!normalized) {
				throw new RecaseError({
					message: `Failed to initialize purchase limit window for feature ${topup.feature_id}`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			purchaseWindowEndsAt = normalized.windowEndsAt;
		}

		await autoTopupLimitRepo.updateById({
			ctx,
			id: state.id,
			updates: {
				purchase_count: count,
				purchase_window_ends_at: purchaseWindowEndsAt,
				updated_at: now,
			},
		});
	}

	return stripAutoTopupCountsForStorage(autoTopups) ?? [];
};
