import {
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	getStartingBalance,
	isEntityScopedCusEnt,
	notNullish,
	nullish,
} from "@autumn/shared";

import { Decimal } from "decimal.js";

import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { performDeduction } from "./performDeduction";

export const performDeductionOnCusEnt = ({
	cusEnt,
	toDeduct,
	entityId,
	allowNegativeBalance = false,
	addAdjustment = false,
	setZeroAdjustment = false,
	blockUsageLimit = true,
	field = "balance",
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	toDeduct: number;
	entityId?: string | null;
	allowNegativeBalance?: boolean;
	addAdjustment?: boolean;
	setZeroAdjustment?: boolean;
	blockUsageLimit?: boolean;
	field?: "balance" | "additional_balance";
}): {
	newBalance: number;
	newEntities: Record<string, EntityBalance> | undefined;
	deducted: number;
	toDeduct: number;
	newAdjustment?: number;
} => {
	let newEntities: Record<string, EntityBalance> | undefined =
		structuredClone(cusEnt.entities) ?? undefined;

	let newBalance: number = structuredClone(cusEnt[field]) ?? 0;
	let deducted = 0;

	// To deprecate: adjustment.
	let newAdjustment = structuredClone(cusEnt.adjustment);

	const cusProduct = cusEnt.customer_product;

	// 2. Get options, related price and starting balance!
	const options = notNullish(cusProduct)
		? getEntOptions(cusProduct.options, cusEnt.entitlement)
		: undefined;

	const cusPrice = notNullish(cusProduct)
		? getRelatedCusPrice(cusEnt, cusProduct.customer_prices)
		: undefined;

	const resetBalance = notNullish(cusProduct)
		? getStartingBalance({
				options: options || undefined,
				relatedPrice: cusPrice?.price,
				entitlement: cusEnt.entitlement,
			})
		: cusEnt.entitlement.allowance || 0;

	if (isEntityScopedCusEnt(cusEnt)) {
		// CASE 1: Deduct from entity balances

		if (nullish(entityId)) {
			newEntities = structuredClone(cusEnt.entities) as Record<
				string,
				EntityBalance
			>;
			if (!newEntities) newEntities = {};

			let toDeductCursor = toDeduct;
			for (const entityId in cusEnt.entities) {
				if (toDeductCursor === 0) break;

				const entityBalance = cusEnt.entities[entityId][field];

				const {
					newBalance: newEntityBalance,
					deducted: newDeducted,
					toDeduct: newToDeduct,
				} = performDeduction({
					cusEntBalance: new Decimal(entityBalance ?? 0),
					toDeduct: toDeductCursor,
					allowNegativeBalance,
					ent: cusEnt.entitlement,
					resetBalance,
					blockUsageLimit,
				});

				newEntities[entityId][field] = newEntityBalance!;

				if (addAdjustment) {
					const adjustment = newEntities[entityId].adjustment || 0;
					newEntities[entityId].adjustment = adjustment - newDeducted!;
				}

				if (setZeroAdjustment) {
					newEntities[entityId].adjustment = 0;
				}

				toDeductCursor = newToDeduct;
				deducted += newDeducted;
			}

			toDeduct = toDeductCursor;
		}

		// CASE 2: Deduct from entity balance
		else {
			if (!newEntities) newEntities = {};

			const currentEntityBalance = cusEnt.entities?.[entityId]?.[field];

			const {
				newBalance: newEntityBalance,
				deducted: newDeducted,
				toDeduct: newToDeduct,
			} = performDeduction({
				cusEntBalance: new Decimal(currentEntityBalance!),
				toDeduct,
				allowNegativeBalance,
				ent: cusEnt.entitlement,
				resetBalance,
				blockUsageLimit,
			});

			newEntities[entityId][field] = newEntityBalance!;

			if (addAdjustment) {
				const adjustment = newEntities[entityId].adjustment || 0;
				newEntities[entityId].adjustment = adjustment - newDeducted!;
			}

			if (setZeroAdjustment) {
				newEntities[entityId].adjustment = 0;
			}

			toDeduct = newToDeduct;
			deducted += newDeducted;
		}
	}

	// CASE 3: Deduct from balance
	else {
		const currentBalance = cusEnt[field] || 0;

		const {
			newBalance: newBalance_,
			deducted: deducted_,
			toDeduct: newToDeduct_,
		} = performDeduction({
			cusEntBalance: new Decimal(currentBalance),
			toDeduct,
			allowNegativeBalance,
			ent: cusEnt.entitlement,
			resetBalance,
			blockUsageLimit,
		});

		newBalance = newBalance_;
		deducted = deducted_;
		toDeduct = newToDeduct_;

		if (addAdjustment) {
			const adjustment = cusEnt.adjustment || 0;
			newAdjustment = adjustment - deducted!;
		}
	}

	return {
		newBalance,
		newEntities,
		deducted,
		toDeduct,
		newAdjustment: newAdjustment ?? undefined,
	};
};
