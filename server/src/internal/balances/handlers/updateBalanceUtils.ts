import {
	type Entity,
	ErrCode,
	type Feature,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { filterCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import RecaseError from "@/utils/errorUtils.js";

/**
 * Update balance by adjusting additional_granted_balance
 * Used by handleUpdateBalance to set a target balance
 *
 * Logic:
 * - If target > current: Increment additional_granted_balance
 * - If target < current: Decrement additional_granted_balance (with validation)
 * - Never modifies additional_balance
 */
export const updateBalanceWithGrantedAdjustment = async ({
	cusEnts,
	entity,
	feature,
	targetBalance,
	ctx,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entity?: Entity;
	feature: Feature;
	targetBalance: number;
	ctx: AutumnContext;
}) => {
	const { db, features } = ctx;

	// Filter to relevant cusEnts
	const filteredCusEnts = filterCusEnts({
		cusEnts,
		feature,
		entity,
		features,
	}) as FullCusEntWithFullCusProduct[];

	if (filteredCusEnts.length === 0) {
		throw new RecaseError({
			message: `No customer entitlements found for feature ${feature.id}`,
			code: ErrCode.NotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	// Get current balance from the actual DB field
	const cusEnt = filteredCusEnts[0];
	const currentBalance = cusEnt.balance ?? 0;

	// Calculate difference
	const diff = new Decimal(targetBalance).minus(currentBalance).toNumber();

	// If no change, return early
	if (diff === 0) {
		return;
	}

	const currentAdditionalGranted = cusEnt.additional_granted_balance ?? 0;

	if (diff > 0) {
		// Increase: Add to additional_granted_balance
		const newAdditionalGranted = new Decimal(currentAdditionalGranted)
			.add(diff)
			.toNumber();
		const newBalance = targetBalance;

		await CusEntService.update({
			db,
			id: cusEnt.id,
			updates: {
				additional_granted_balance: newAdditionalGranted,
				balance: newBalance,
			},
		});
	} else {
		// Decrease: Subtract from additional_granted_balance
		const toSubtract = Math.abs(diff);

		if (currentAdditionalGranted < toSubtract) {
			throw new RecaseError({
				message: `Cannot decrease balance below granted amount. Current additional_granted_balance: ${currentAdditionalGranted}, attempting to subtract: ${toSubtract}`,
				code: ErrCode.BadRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const newAdditionalGranted = new Decimal(currentAdditionalGranted)
			.minus(toSubtract)
			.toNumber();
		const newBalance = targetBalance;

		await CusEntService.update({
			db,
			id: cusEnt.id,
			updates: {
				additional_granted_balance: newAdditionalGranted,
				balance: newBalance,
			},
		});
	}
};
