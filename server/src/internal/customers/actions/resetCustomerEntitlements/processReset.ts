import {
	cusEntToOptions,
	type EntInterval,
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
	getStartingBalance,
	isLifetimeEntitlement,
	isUnlimitedEntitlement,
	type Rollover,
} from "@autumn/shared";
import { logger } from "better-auth";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";
import { getResetAtUpdate } from "./getResetAtUpdate.js";

export type ResetUpdates = {
	balance: number | null;
	additional_balance: number | null;
	adjustment: number;
	entities: Record<string, EntityBalance> | null;
	next_reset_at: number;
};

export type ProcessResetResult = {
	updates: ResetUpdates;
	rolloverInsert?: { rows: Rollover[]; fullCusEnt: FullCustomerEntitlement };
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

	// Unlimited / lifetime cusEnts should never reach here
	// (getCusEntsNeedingReset filters them out), but guard defensively
	if (
		isUnlimitedEntitlement({ entitlement: ent }) ||
		isLifetimeEntitlement({ entitlement: ent })
	) {
		return null;
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

	const { org, env } = ctx;

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

	const updates: ResetUpdates =
		"entities" in resetBalanceUpdate
			? {
					balance: null,
					additional_balance: null,
					adjustment: 0,
					entities: resetBalanceUpdate.entities,
					next_reset_at: nextResetAt,
				}
			: {
					balance: resetBalanceUpdate.balance,
					additional_balance: resetBalanceUpdate.additional_balance,
					adjustment: 0,
					entities: null,
					next_reset_at: nextResetAt,
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
