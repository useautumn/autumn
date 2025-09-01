import {
	type Customer,
	EntInterval,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomerPrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";

export const handlePrepaidPrices = async ({
	db,
	stripeCli,
	cusProduct,
	cusPrice,
	usageSub,
	customer,
	invoice,
	logger,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	cusProduct: FullCusProduct;
	cusPrice: FullCustomerPrice;
	usageSub: Stripe.Subscription;
	customer: Customer;
	invoice: Stripe.Invoice;
	logger: any;
}) => {
	const { start, end } = subToPeriodStartEnd({ sub: usageSub });
	const isNewPeriod = invoice.period_start !== start;

	if (!isNewPeriod) {
		return;
	}

	const cusEnt = getRelatedCusEnt({
		cusPrice,
		cusEnts: cusProduct.customer_entitlements,
	});

	if (!cusEnt) {
		logger.error(
			`Tried to handle prepaid price for ${cusPrice.id} (${cusPrice.price.id}) but no cus ent found`,
		);
		return;
	}

	const options = getEntOptions(cusProduct.options, cusEnt.entitlement);

	// const resetBalance = getResetBalance({
	//   entitlement: cusEnt.entitlement,
	//   options: notNullish(options?.upcoming_quantity)
	//     ? {
	//         feature_id: options?.feature_id!,
	//         quantity: options?.upcoming_quantity!,
	//       }
	//     : options,
	//   relatedPrice: cusPrice.price,
	// });
	const resetQuantity = options?.upcoming_quantity || options?.quantity!;
	const config = cusPrice.price.config as UsagePriceConfig;
	const billingUnits = config.billing_units || 1;
	const newAllowance =
		resetQuantity * billingUnits + (cusEnt.entitlement.allowance || 0);

	const resetUpdate = getResetBalancesUpdate({
		cusEnt,
		allowance: newAllowance,
	});

	// console.log("--------------------------------");
	// console.log(`Entity ID: ${cusProduct.entity_id}`);
	// console.log(`Upcoming quantity: ${options?.upcoming_quantity}`);
	// console.log(`Quantity: ${options?.quantity}`);
	// console.log(`New allowance: ${newAllowance}`);
	// console.log(`RESET UPDATE: ${JSON.stringify(resetUpdate)}`);

	const ent = cusEnt.entitlement;

	const rolloverUpdate = getRolloverUpdates({
		cusEnt,
		nextResetAt: end * 1000,
	});

	if (notNullish(options?.upcoming_quantity)) {
		const newOptions = cusProduct.options.map((o) => {
			if (o.feature_id === ent.feature_id) {
				return {
					...o,
					quantity: o.upcoming_quantity,
					upcoming_quantity: undefined,
				};
			}
			return o;
		});

		await CusProductService.update({
			db,
			cusProductId: cusProduct.id,
			updates: {
				options: newOptions as FeatureOptions[],
			},
		});

		if (ent.interval === EntInterval.Lifetime) {
			const difference = options?.quantity! - options?.upcoming_quantity!;
			await CusEntService.decrement({
				db,
				id: cusEnt.id,
				amount: difference,
			});
			return;
		}
	}

	if (ent.interval === EntInterval.Lifetime) {
		return;
	}

	if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
		await RolloverService.insert({
			db,
			rows: rolloverUpdate.toInsert,
			fullCusEnt: cusEnt,
		});
	}

	await CusEntService.update({
		db,
		id: cusEnt.id,
		updates: {
			...resetUpdate,
			next_reset_at: end * 1000,
		},
	});
};
