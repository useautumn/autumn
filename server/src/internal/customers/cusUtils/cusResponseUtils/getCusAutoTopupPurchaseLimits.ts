import { type AutoTopupResponse, CustomerExpand } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { normalizeWindowCounter } from "@/internal/balances/autoTopUp/helpers/limits/autoTopupLimitWindowUtils.js";
import { autoTopupLimitRepo } from "@/internal/balances/autoTopUp/repos";

export const getCusAutoTopupPurchaseLimits = async ({
	ctx,
	internalCustomerId,
	autoTopupsConfig,
	expand,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	autoTopupsConfig: AutoTopupResponse[] | null | undefined;
	expand: CustomerExpand[];
}): Promise<AutoTopupResponse[] | undefined> => {
	if (!expand.includes(CustomerExpand.AutoTopupsPurchaseLimit)) {
		return undefined;
	}

	if (!autoTopupsConfig || autoTopupsConfig.length === 0) {
		return undefined;
	}

	const rows = await autoTopupLimitRepo.findAllByCustomer({
		ctx,
		internalCustomerId,
	});

	const rowsByFeatureId = new Map(
		rows.map((row) => [row.feature_id, row] as const),
	);

	return autoTopupsConfig.map((config): AutoTopupResponse => {
		const row = rowsByFeatureId.get(config.feature_id);
		if (!row) {
			return config;
		}

		const configuredLimit =
			config.purchase_limit && !("count" in config.purchase_limit)
				? config.purchase_limit
				: undefined;
		const normalized = normalizeWindowCounter({
			now: Date.now(),
			windowEndsAt: row.purchase_window_ends_at,
			count: row.purchase_count,
			windowConfig: configuredLimit,
			from: row.purchase_window_ends_at,
		});

		return {
			...config,
			purchase_limit: {
				interval: configuredLimit?.interval ?? null,
				interval_count: configuredLimit?.interval_count ?? null,
				limit: configuredLimit?.limit ?? null,
				count: normalized?.count ?? row.purchase_count,
				next_reset_at: normalized?.windowEndsAt ?? row.purchase_window_ends_at,
			},
		};
	});
};
