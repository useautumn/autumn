import {
	cusEntToCusPrice,
	priceToProrationConfig,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { generateId } from "@/utils/genUtils";
import type { AllocatedInvoiceContext } from "../allocatedInvoiceContext";
import { allocatedInvoiceIsUpgrade } from "./allocatedInvoiceIsUpgrade";

export const computeUpdateCustomerEntitlementPlan = ({
	billingContext,
}: {
	billingContext: AllocatedInvoiceContext;
}): UpdateCustomerEntitlement | undefined => {
	const {
		customerEntitlement,
		previousUsage,
		newUsage,
		previousOverage,
		newOverage,
	} = billingContext;

	const isUpgrade = allocatedInvoiceIsUpgrade({
		billingContext,
	});

	if (isUpgrade) {
		const newOverageUsage = new Decimal(newOverage)
			.sub(previousOverage)
			.toNumber();

		const replaceablesToDelete = customerEntitlement.replaceables.slice(
			0,
			newOverageUsage,
		);

		return {
			customerEntitlement,
			balanceChange: replaceablesToDelete.length,
			deletedReplaceables: replaceablesToDelete,
		};
	}

	if (previousOverage <= 0) {
		return {
			customerEntitlement,
			balanceChange: 0,
		};
	} else {
		const customerPrice = cusEntToCusPrice({
			cusEnt: customerEntitlement,
			errorOnNotFound: true,
		});

		const { shouldCreateReplaceables } = priceToProrationConfig({
			price: customerPrice.price,
			isUpgrade,
		});

		if (shouldCreateReplaceables) {
			const numReplaceablesToCreate = Math.max(
				0,
				new Decimal(previousUsage).sub(newUsage).toNumber(),
			);

			return {
				customerEntitlement,
				balanceChange: -numReplaceablesToCreate,
				insertReplaceables: Array.from(
					{ length: numReplaceablesToCreate },
					() => ({
						id: generateId("rep"),
						cus_ent_id: customerEntitlement.id,
						created_at: Date.now(),
						delete_next_cycle: true,
					}),
				),
			};
		}

		return {
			customerEntitlement,
			balanceChange: 0,
		};
	}
};
