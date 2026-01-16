import type {
	FullCustomerEntitlement,
	FullCustomerPrice,
} from "@autumn/shared";
import { customerPriceToCustomerEntitlement } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { removeReplaceablesFromCusEnt } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/linkedCusEntUtils.js";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService.js";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";

export const handleContUsePrices = async ({
	db,
	cusEnts,
	cusPrice,
	invoice,
	usageSub,
	logger,
	resetBalance = true,
}: {
	db: DrizzleCli;
	cusEnts: FullCustomerEntitlement[];
	cusPrice: FullCustomerPrice;
	invoice: Stripe.Invoice;
	usageSub: Stripe.Subscription;
	logger: any;
	resetBalance?: boolean;
}): Promise<boolean> => {
	const cusEnt = customerPriceToCustomerEntitlement({
		customerPrice: cusPrice,
		customerEntitlements: cusEnts,
	});

	if (!cusEnt) {
		console.log("No related cus ent found");
		return false;
	}

	// If invoice is not for new period (eg. upgrades, etc, skip)
	const { start } = subToPeriodStartEnd({
		sub: usageSub,
	});
	const isNewPeriod = invoice.period_start !== start;
	if (!isNewPeriod) {
		return false;
	}

	if (!resetBalance) {
		return false;
	}

	const feature = cusEnt.entitlement.feature;
	logger.info(
		`Handling invoice.created for in arrear prorated, feature: ${feature.id}`,
	);

	const replaceables = cusEnt.replaceables.filter((r) => r.delete_next_cycle);

	if (replaceables.length === 0) return false;

	logger.info(`🚀 Deleting replaceables for ${feature.id}`);

	const linkedCusEnts = findLinkedCusEnts({
		cusEnts,
		feature,
	});

	for (const linkedCusEnt of linkedCusEnts) {
		const { newEntities } = removeReplaceablesFromCusEnt({
			cusEnt: linkedCusEnt,
			replaceableIds: replaceables.map((r) => r.id),
		});

		await CusEntService.update({
			db,
			id: linkedCusEnt.id,
			updates: {
				entities: newEntities,
			},
		});
	}

	await CusEntService.increment({
		db,
		id: cusEnt.id,
		amount: replaceables.length,
	});

	await RepService.deleteInIds({
		db,
		ids: replaceables.map((r) => r.id),
	});

	return true;
};
