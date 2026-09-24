import {
	cusEntToStartingBalance,
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	type FullCusEntWithProduct,
	getResetBalancesUpdate,
	getRolloverUpdates,
	isLifetimeEntitlement,
	isUnlimitedEntitlement,
	orgPersistFreeOverage,
	type Rollover,
	type UsageAttribution,
} from "@autumn/shared";
import { logger } from "better-auth";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { promoteDuePooledContributions } from "@/internal/billing/v2/pooledBalances/execute/promoteDuePooledContributions.js";
import { getResetAtUpdate } from "./getResetAtUpdate.js";

export type ResetUpdates = {
	balance: number | null;
	additional_balance: number | null;
	adjustment: number;
	entities: Record<string, EntityBalance> | null;
	usage_attribution: UsageAttribution;
	next_reset_at: number;
};

export type ProcessResetResult = {
	updates: ResetUpdates;
	rolloverInsert?: {
		rows: Rollover[];
		fullCusEnt: FullCusEntWithProduct;
	};
	/** Authoritative pool granted after contribution promotion/drift-healing;
	 * callers must propagate it to their caches after their own cache writes. */
	pooledGranted?: number;
	pooledContributionsPromoted?: boolean;
};

/** Processes a single cusEnt reset. Returns updates + optional rollover insert, or null if skipped. */
export const processReset = async ({
	cusEnt,
	ctx,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	ctx: AutumnContext;
}): Promise<ProcessResetResult | null> => {
	const ent = cusEnt.entitlement;
	const cusProduct = cusEnt.customer_product;

	// Lifetime cusEnts should never reach here
	// (getCusEntsNeedingReset filters them out), but guard defensively
	if (isLifetimeEntitlement({ entitlement: ent })) {
		return null;
	}

	// Due next-cycle contributions change the pool's granted, so promote
	// before deriving the refill amount.
	let pooledGranted: number | undefined;
	let pooledContributionsPromoted: boolean | undefined;
	if (cusEnt.pooled_balance) {
		const promotion = await promoteDuePooledContributions({
			ctx,
			customerEntitlement: cusEnt,
			now: Date.now(),
		});
		if (promotion !== null) {
			pooledGranted = promotion.granted;
			pooledContributionsPromoted = promotion.promotedCount > 0;
		}
	}

	const resetBalance = cusEntToStartingBalance({ cusEnt });

	if (!cusEnt.next_reset_at) {
		logger.error(
			`[customerEntitlement processReset] next_reset_at is null, cusEntId: ${cusEnt.id}`,
		);
		return null;
	}

	const { org, env } = ctx;
	if (!ent.interval) {
		logger.error(
			`[customerEntitlement processReset] interval is null, cusEntId: ${cusEnt.id}`,
		);
		return null;
	}

	// Compute next reset time (with Stripe anchor adjustment on edge dates)
	const nextResetAt = await getResetAtUpdate({
		curResetAt: cusEnt.next_reset_at,
		interval: ent.interval,
		intervalCount: ent.interval_count,
		cusProduct,
		org,
		env,
	});

	// Compute rollover before resetting balance
	const rolloverUpdate = getRolloverUpdates({
		cusEnt,
		nextResetAt: cusEnt.next_reset_at,
	});

	// Compute reset balance update
	// An unlimited row's negative balance is a usage counter, not owed overage.
	const persistFreeOverage =
		orgPersistFreeOverage({ org: ctx.org }) &&
		!isUnlimitedEntitlement({ entitlement: ent });
	const resetBalanceUpdate = getResetBalancesUpdate({
		cusEnt,
		allowance: resetBalance,
		persistFreeOverage,
	});

	const updates: ResetUpdates =
		"entities" in resetBalanceUpdate
			? {
					balance: null,
					additional_balance: null,
					adjustment: 0,
					entities: resetBalanceUpdate.entities,
					usage_attribution: resetBalanceUpdate.usage_attribution,
					next_reset_at: nextResetAt,
				}
			: {
					balance: resetBalanceUpdate.balance,
					additional_balance: resetBalanceUpdate.additional_balance,
					adjustment: 0,
					entities: null,
					usage_attribution: resetBalanceUpdate.usage_attribution,
					next_reset_at: nextResetAt,
				};

	let rolloverInsert:
		| { rows: Rollover[]; fullCusEnt: FullCusEntWithProduct }
		| undefined;

	if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
		rolloverInsert = {
			rows: rolloverUpdate.toInsert,
			fullCusEnt: cusEnt,
		};
	}

	return {
		updates,
		rolloverInsert,
		pooledGranted,
		pooledContributionsPromoted,
	};
};
