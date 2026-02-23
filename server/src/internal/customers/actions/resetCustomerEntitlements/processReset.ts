import {
	type AppEnv,
	cusEntToOptions,
	type EntInterval,
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
	getStartingBalance,
	isLifetimeEntitlement,
	isUnlimitedEntitlement,
	type Organization,
	type Rollover,
} from "@autumn/shared";
import { logger } from "better-auth";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";
import { getResetAtUpdate } from "./getResetAtUpdate.js";

export type ProcessResetResult = {
	updates: Record<string, unknown>;
	rolloverInsert?: { rows: Rollover[]; fullCusEnt: FullCustomerEntitlement };
};

/** Processes a single cusEnt reset. Returns updates + optional rollover insert, or null if skipped. */
export const processReset = async ({
	cusEnt,
	org,
	env,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	org: Organization;
	env: AppEnv;
}): Promise<ProcessResetResult | null> => {
	const ent = cusEnt.entitlement;
	const cusProduct = cusEnt.customer_product;

	// Handle unlimited entitlements
	if (
		isUnlimitedEntitlement({ entitlement: ent }) ||
		isLifetimeEntitlement({ entitlement: ent })
	) {
		return { updates: { next_reset_at: null } };
	}

	const options = cusEntToOptions({ cusEnt });

	const resetBalance = getStartingBalance({
		entitlement: cusEnt.entitlement,
		options,
		productQuantity: cusProduct?.quantity ?? 1,
	});

	if (!cusEnt.next_reset_at) {
		logger.error(
			`[customerEntitlement processReset] next_reset_at is null, cusEntId: ${cusEnt.id}`,
		);
		return null;
	}

	// Compute next reset time (with Stripe anchor adjustment on edge dates)
	const nextResetAt = await getResetAtUpdate({
		curResetAt: cusEnt.next_reset_at,
		interval: ent.interval as EntInterval,
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
	const resetBalanceUpdate = getResetBalancesUpdate({
		cusEnt,
		allowance: resetBalance,
	});

	const updates = {
		...resetBalanceUpdate,
		next_reset_at: nextResetAt,
		adjustment: 0,
	};

	let rolloverInsert:
		| { rows: Rollover[]; fullCusEnt: FullCustomerEntitlement }
		| undefined;

	if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
		rolloverInsert = {
			rows: rolloverUpdate.toInsert,
			fullCusEnt: cusEnt,
		};
	}

	return { updates, rolloverInsert };
};
