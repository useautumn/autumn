import {
	cusProductsToCusPrices,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	type PgDeductionUpdate,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { adjustAllowance } from "../../../../trigger/adjustAllowance";
import { CusEntService } from "../../../customers/cusProducts/cusEnts/CusEntitlementService";
import { getTotalNegativeBalance } from "../../../customers/cusProducts/cusEnts/cusEntUtils";

export const handlePaidAllocatedCusEnt = async ({
	ctx,
	cusEnt,
	fullCus,
	updates,
}: {
	ctx: AutumnContext;
	cusEnt: FullCusEntWithFullCusProduct;
	fullCus: FullCustomer;
	updates: Record<string, PgDeductionUpdate>;
}) => {
	const { db, env, org } = ctx;

	const update = updates[cusEnt.id];

	const cusPrices = cusProductsToCusPrices({
		cusProducts: fullCus.customer_products,
	});

	// Calculate original negative balance
	const originalGrpBalance = getTotalNegativeBalance({
		cusEnt,
		balance: cusEnt.balance!,
		entities: cusEnt.entities!,
	});

	// Calculate new negative balance from updates
	const newGrpBalance = getTotalNegativeBalance({
		cusEnt,
		balance: update.balance,
		entities: update.entities,
	});

	const { newReplaceables, deletedReplaceables } = await adjustAllowance({
		db,
		env,
		org,
		cusPrices: cusPrices as any,
		customer: fullCus,
		affectedFeature: cusEnt.entitlement.feature,
		cusEnt: cusEnt as any,
		originalBalance: originalGrpBalance,
		newBalance: newGrpBalance,
		logger: ctx.logger,
	});

	// Adjust balance based on replaceables
	let reUpdatedBalance = update.balance;

	if (newReplaceables && newReplaceables.length > 0) {
		reUpdatedBalance = reUpdatedBalance - newReplaceables.length;
	} else if (deletedReplaceables && deletedReplaceables.length > 0) {
		reUpdatedBalance = reUpdatedBalance + deletedReplaceables.length;
	}

	if (reUpdatedBalance !== update.balance) {
		await CusEntService.update({
			db,
			id: cusEnt.id,
			updates: {
				balance: reUpdatedBalance,
			},
		});

		// Update the updates object with the new balance
		const cusEntId = cusEnt.id;
		updates[cusEntId].balance = reUpdatedBalance;
		updates[cusEntId].newReplaceables = newReplaceables ?? undefined;
		updates[cusEntId].deletedReplaceables = deletedReplaceables ?? undefined;
	}
};
