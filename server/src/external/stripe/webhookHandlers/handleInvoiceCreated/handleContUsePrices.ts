import type {
	FullCustomerEntitlement,
	FullCustomerPrice,
} from "@autumn/shared";
import { customerPriceToCustomerEntitlement } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { removeReplaceablesFromCusEnt } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/linkedCusEntUtils.js";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService.js";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";

export const handleContUsePrices = async ({
	ctx,
	cusEnts,
	cusPrice,
	invoice,
	usageSub,
	resetBalance = true,
}: {
	ctx: AutumnContext;
	cusEnts: FullCustomerEntitlement[];
	cusPrice: FullCustomerPrice;
	invoice: Stripe.Invoice;
	usageSub: Stripe.Subscription;
	resetBalance?: boolean;
}): Promise<boolean> => {
	const { logger } = ctx;
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
			ctx,
			id: linkedCusEnt.id,
			updates: {
				entities: newEntities,
			},
		});
	}

	await CusEntService.increment({
		ctx,
		id: cusEnt.id,
		amount: replaceables.length,
	});

	await RepService.deleteInIds({
		ctx,
		ids: replaceables.map((r) => r.id),
	});

	return true;
};
