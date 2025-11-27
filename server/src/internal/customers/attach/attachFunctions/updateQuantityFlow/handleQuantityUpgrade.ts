import {
	type AttachConfig,
	calculateProrationAmount,
	cusProductToProduct,
	type Feature,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomerPrice,
	getFeatureInvoiceDescription,
	OnIncrease,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { Stripe } from "stripe";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import {
	shouldBillNow,
	shouldProrate,
} from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

export const handleQuantityUpgrade = async ({
	ctx,
	attachParams,
	cusProduct,
	stripeSubs,
	attachConfig,
	oldOptions,
	newOptions,
	cusPrice,
	stripeSub,
	subItem,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	cusProduct: FullCusProduct;
	attachConfig: AttachConfig;
	stripeSubs: Stripe.Subscription[];
	oldOptions: FeatureOptions;
	newOptions: FeatureOptions;
	cusPrice: FullCustomerPrice;
	stripeSub: Stripe.Subscription;
	subItem: Stripe.SubscriptionItem;
}) => {
	// Manually calculate prorations...
	const { features, org, logger, db } = ctx;
	const { stripeCli, now, paymentMethod } = attachParams;

	const difference = new Decimal(newOptions.quantity)
		.minus(oldOptions.quantity)
		.toNumber();

	const subItemDifference = new Decimal(newOptions.quantity)
		.minus(
			notNullish(oldOptions.upcoming_quantity)
				? oldOptions.upcoming_quantity!
				: oldOptions.quantity,
		)
		.toNumber();

	const onIncrease =
		cusPrice.price.proration_config?.on_increase ||
		OnIncrease.ProrateImmediately;

	const prorate = shouldProrate(onIncrease);
	const config = cusPrice.price.config as UsagePriceConfig;
	const billingUnits = config.billing_units || 1;

	let invoice = null;
	if (prorate && stripeSub?.status !== "trialing") {
		const { start, end } = subToPeriodStartEnd({ sub: stripeSub });

		const prevAmount = priceToInvoiceAmount({
			price: cusPrice.price,
			quantity: new Decimal(oldOptions.quantity).mul(billingUnits!).toNumber(),
		});

		const newAmount = priceToInvoiceAmount({
			price: cusPrice.price,
			quantity: new Decimal(newOptions.quantity).mul(billingUnits!).toNumber(),
		});

		let amount = new Decimal(newAmount).minus(prevAmount).toNumber();
		if (prorate) {
			amount = calculateProrationAmount({
				periodEnd: end * 1000,
				periodStart: start * 1000,
				now: now || Date.now(),
				amount,
			});
		}

		const feature = features.find(
			(f: Feature) => f.internal_id === newOptions.internal_feature_id,
		)!;

		const product = cusProductToProduct({ cusProduct });
		const invoiceItem = constructStripeInvoiceItem({
			product,
			amount: amount,
			org: org,
			price: cusPrice.price,
			description: getFeatureInvoiceDescription({
				feature: feature,
				usage: newOptions.quantity,
				billingUnits,
				prodName: product.name,
				isPrepaid: true,
				fromUnix: now,
			}),
			stripeSubId: stripeSub.id,
			stripeCustomerId: stripeSub.customer as string,
			periodStart: Math.floor((now || Date.now()) / 1000),
			periodEnd: Math.floor(end * 1000),
		});

		logger.info(
			`🔥 Creating prepaid invoice item: ${invoiceItem.description} - ${amount}`,
		);

		await stripeCli.invoiceItems.create(invoiceItem);

		if (shouldBillNow(onIncrease)) {
			const { invoice: finalInvoice } = await createAndFinalizeInvoice({
				stripeCli,
				stripeCusId: stripeSub.customer as string,
				stripeSubId: stripeSub.id,
				paymentMethod: paymentMethod || null,
				chargeAutomatically: !attachConfig.invoiceOnly,
				logger,
			});

			try {
				const invoiceItems = await getInvoiceItems({
					stripeInvoice: finalInvoice,
					prices: [cusPrice.price],
					logger,
				});

				await InvoiceService.createInvoiceFromStripe({
					db,
					stripeInvoice: finalInvoice,
					internalCustomerId: cusProduct.internal_customer_id!,
					internalEntityId: cusProduct.internal_entity_id,
					productIds: [cusProduct.product_id],
					internalProductIds: [cusProduct.internal_product_id],
					org,
					sendRevenueEvent: true,
					items: invoiceItems,
				});
			} catch (error) {
				logger.error(`Failed to create invoice from stripe: ${error}`);
			}
			invoice = finalInvoice;
		}
	}

	await stripeCli.subscriptionItems.update(subItem.id, {
		// quantity: newOptions.quantity,
		quantity: (subItem.quantity || 0) + subItemDifference,
		proration_behavior: "none",
	});

	// Update cus ent

	const cusEnt = getRelatedCusEnt({
		cusPrice,
		cusEnts: cusProduct.customer_entitlements,
	});

	if (cusEnt) {
		const incrementBy = new Decimal(difference).mul(billingUnits).toNumber();
		logger.info(
			`🔥 Incrementing feature ${cusEnt.entitlement.feature.id} balance by ${incrementBy}`,
		);
		await CusEntService.increment({
			db,
			id: cusEnt.id,
			amount: incrementBy,
		});
	}
	return { invoice };
};
