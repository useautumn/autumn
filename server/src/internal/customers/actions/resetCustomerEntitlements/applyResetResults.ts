import type {
	FullCusEntWithProduct,
	FullCusProduct,
	FullCustomer,
	FullCustomerEntitlement,
	Rollover,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import type { ProcessResetResult } from "./processReset.js";

export type RolloverClearingInfo = {
	deletedIds: string[];
	overwrites: Rollover[];
};

const findCusEnt = ({
	fullCus,
	cusEntId,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
}): {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct | null;
} | null => {
	for (const cusProduct of fullCus.customer_products) {
		for (const cusEnt of cusProduct.customer_entitlements) {
			if (cusEnt.id === cusEntId)
				return {
					customerEntitlement: cusEnt,
					customerProduct: cusProduct,
				};
		}
	}
	for (const cusEnt of fullCus.extra_customer_entitlements || []) {
		if (cusEnt.id === cusEntId)
			return {
				customerEntitlement: cusEnt,
				customerProduct: null,
			};
	}
	for (const cusEnt of fullCus.pooled_customer_entitlements || []) {
		if (cusEnt.id === cusEntId)
			return {
				customerEntitlement: cusEnt,
				customerProduct: null,
			};
	}
	return null;
};

export const applyResetResults = async ({
	ctx,
	fullCus,
	computed,
	skipped,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	computed: Array<{ cusEntId: string; result: ProcessResetResult }>;
	skipped: string[];
}): Promise<Record<string, RolloverClearingInfo>> => {
	const skippedSet = new Set(skipped);
	const clearingMap: Record<string, RolloverClearingInfo> = {};

	const generalCtx = { ...ctx, db: ctx.dbGeneral };

	for (const { cusEntId, result } of computed) {
		const match = findCusEnt({ fullCus, cusEntId });
		if (!match) continue;
		const { customerEntitlement: original, customerProduct } = match;

		const { updates } = result;
		if (updates.balance !== null) original.balance = updates.balance;
		if (updates.additional_balance !== null)
			original.additional_balance = updates.additional_balance;
		original.adjustment = updates.adjustment;
		if (updates.entities !== null) original.entities = updates.entities;
		original.usage_attribution = updates.usage_attribution;
		original.next_reset_at = updates.next_reset_at;

		if (!result.rolloverInsert) continue;

		if (!skippedSet.has(cusEntId)) {
			const { rollovers, deletedIds, overwrites } =
				await RolloverService.clearExcessRollovers({
					ctx: generalCtx,
					newRows: result.rolloverInsert.rows,
					fullCusEnt: {
						...original,
						customer_product: customerProduct,
					} satisfies FullCusEntWithProduct,
				});
			original.rollovers = rollovers;

			if (deletedIds.length > 0 || overwrites.length > 0) {
				clearingMap[cusEntId] = { deletedIds, overwrites };
			}
		} else {
			original.rollovers = await RolloverService.getCurrentRollovers({
				ctx: generalCtx,
				cusEntID: cusEntId,
			});
		}
	}

	return clearingMap;
};
