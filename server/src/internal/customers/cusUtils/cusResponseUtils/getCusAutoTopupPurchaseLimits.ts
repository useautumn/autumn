import { type AutoTopupResponse, CustomerExpand } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { normalizeWindowCounter } from "@/internal/balances/autoTopUp/helpers/limits/autoTopupLimitWindowUtils.js";
import { autoTopupLimitRepo } from "@/internal/balances/autoTopUp/repos";

/**
 * When `expand=billing_controls.auto_topups.purchase_limit` is requested,
 * return a replacement `auto_topups` array where each entry's `purchase_limit`
 * is augmented with runtime tracking (`count`, `next_reset_at`) from the
 * `auto_topup_limit_states` table.
 *
 * Behavior:
 *   - Returns `undefined` when the expand path is not requested.
 *   - Returns `undefined` when there are no configured auto_topups.
 *   - For each configured auto_topup with a matching DB row, the `purchase_limit`
 *     object is rebuilt with `count` + `next_reset_at` from the row. If the
 *     stored window has elapsed, `count` is projected to 0 and `next_reset_at`
 *     is advanced from the stored boundary by the configured interval. If the
 *     config had no `purchase_limit`, `interval` / `interval_count` / `limit`
 *     are returned as `null`.
 *   - For configured auto_topups WITHOUT a matching DB row (no top-up has
 *     ever fired), the entry is passed through unchanged from config.
 */
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
			// No runtime row yet — pass config through unchanged.
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
