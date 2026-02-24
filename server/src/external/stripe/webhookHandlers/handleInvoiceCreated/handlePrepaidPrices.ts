import {
	customerPriceToCustomerEntitlement,
	EntInterval,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomerPrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";

export const handlePrepaidPrices = async ({
	ctx,
	cusProduct,
	cusPrice,
	usageSub,
	invoice,
	resetBalance = true,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
	cusPrice: FullCustomerPrice;
	usageSub: Stripe.Subscription;
	invoice: Stripe.Invoice;
	resetBalance?: boolean;
}): Promise<boolean> => {
	const { logger } = ctx;
	const { org } = ctx;
	const { start, end } = subToPeriodStartEnd({ sub: usageSub });
	const isNewPeriod = invoice.period_start !== start;

	if (!isNewPeriod) return false;

	if (!resetBalance) return false;

	const cusEnt = customerPriceToCustomerEntitlement({
		customerPrice: cusPrice,
		customerEntitlements: cusProduct.customer_entitlements,
	});

	if (!cusEnt) {
		logger.error(
			`Tried to handle prepaid price for ${cusPrice.id} (${cusPrice.price.id}) but no cus ent found`,
		);
		return false;
	}

	const options = getEntOptions(cusProduct.options, cusEnt.entitlement);

	const resetQuantity = (options?.upcoming_quantity || options?.quantity) ?? 0;
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
			ctx,
			cusProductId: cusProduct.id,
			updates: {
				options: newOptions as FeatureOptions[],
			},
		});

		if (ent.interval === EntInterval.Lifetime) {
			const difference =
				(options?.quantity ?? 0) - (options?.upcoming_quantity ?? 0);
			await CusEntService.decrement({
				ctx,
				id: cusEnt.id,
				amount: difference,
			});
			return true;
		}
	}

	if (ent.interval === EntInterval.Lifetime) {
		return false;
	}

	if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
		await RolloverService.insert({
			ctx,
			rows: rolloverUpdate.toInsert,
			fullCusEnt: cusEnt,
		});
	}

	await CusEntService.update({
		ctx,
		id: cusEnt.id,
		updates: {
			...resetUpdate,
			next_reset_at: end * 1000,
		},
	});

	return true;
};
