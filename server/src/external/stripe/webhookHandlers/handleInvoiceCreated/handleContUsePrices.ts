import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { removeReplaceablesFromCusEnt } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/linkedCusEntUtils.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { FullCustomerEntitlement, FullCustomerPrice } from "@autumn/shared";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService.js";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";

export const handleContUsePrices = async ({
	db,
	cusEnts,
	cusPrice,
	stripeCli,
	invoice,
	usageSub,
	logger,
}: {
	db: DrizzleCli;
	cusEnts: FullCustomerEntitlement[];
	cusPrice: FullCustomerPrice;
	stripeCli: Stripe;

	invoice: Stripe.Invoice;
	usageSub: Stripe.Subscription;
	logger: any;
}) => {
	const cusEnt = getRelatedCusEnt({
		cusPrice,
		cusEnts,
	});

	if (!cusEnt) {
		console.log("No related cus ent found");
		return;
	}

	// If invoice is not for new period (eg. upgrades, etc, skip)
	const { start } = subToPeriodStartEnd({
		sub: usageSub,
	});
	const isNewPeriod = invoice.period_start !== start;
	if (!isNewPeriod) {
		return;
	}

	let feature = cusEnt.entitlement.feature;
	logger.info(
		`Handling invoice.created for in arrear prorated, feature: ${feature.id}`,
	);

	let replaceables = cusEnt.replaceables.filter((r) => r.delete_next_cycle);

	if (replaceables.length == 0) {
		return;
	}

	logger.info(`🚀 Deleting replaceables for ${feature.id}`);

	let linkedCusEnts = findLinkedCusEnts({
		cusEnts,
		feature,
	});

	for (const linkedCusEnt of linkedCusEnts) {
		let { newEntities } = removeReplaceablesFromCusEnt({
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

	// let subItem = findStripeItemForPrice({
	//   stripeItems: usageSub.items.data,
	//   price: cusPrice.price,
	// });

	// if (subItem) {
	//   let newQuantity = (subItem.quantity || 0) - replaceables.length;
	//   newQuantity = Math.max(0, newQuantity);
	//   await stripeCli.subscriptionItems.update(subItem.id, {
	//     quantity: newQuantity,
	//     proration_behavior: "always_invoice",
	//   });
	//   logger.info(`Update sub item quantity to ${newQuantity}`);
	// }

	await CusEntService.increment({
		db,
		id: cusEnt.id,
		amount: replaceables.length,
	});

	await RepService.deleteInIds({
		db,
		ids: replaceables.map((r) => r.id),
	});
};
