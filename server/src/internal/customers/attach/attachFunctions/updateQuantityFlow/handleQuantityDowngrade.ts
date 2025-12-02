import {
	type AttachConfig,
	calculateProrationAmount,
	cusProductToProduct,
	type Feature,
	type FeatureOptions,
	type FullCusProduct,
	getFeatureInvoiceDescription,
	OnDecrease,
	priceToInvoiceAmount,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { Stripe } from "stripe";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { featureToCusPrice } from "@/internal/customers/cusProducts/cusPrices/convertCusPriceUtils.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";
import {
	shouldBillNow,
	shouldProrate,
} from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

export const handleQuantityDowngrade = async ({
	ctx,
	attachParams,
	attachConfig,
	cusProduct,
	stripeSub,
	oldOptions,
	newOptions,
	subItem,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	attachConfig: AttachConfig;
	cusProduct: FullCusProduct;
	stripeSub: Stripe.Subscription;
	oldOptions: FeatureOptions;
	newOptions: FeatureOptions;
	subItem: Stripe.SubscriptionItem;
}) => {
	const { db, logger, org, features } = ctx;
	const { stripeCli, paymentMethod } = attachParams;

	const cusPrice = featureToCusPrice({
		internalFeatureId: newOptions.internal_feature_id!,
		cusPrices: cusProduct.customer_prices,
	})!;

	const onDecrease =
		cusPrice.price.proration_config?.on_decrease ||
		OnDecrease.ProrateImmediately;

	const subItemDifference = new Decimal(newOptions.quantity)
		.minus(
			notNullish(oldOptions.upcoming_quantity)
				? oldOptions.upcoming_quantity!
				: oldOptions.quantity,
		)
		.toNumber();

	const billingUnits =
		(cusPrice.price.config as UsagePriceConfig).billing_units || 1;

	const newSubItemQuantity = new Decimal(subItem.quantity || 0)
		.plus(subItemDifference)
		.toNumber();

	let invoice = null;
	const createDowngradeInvoice = async () => {
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

		amount = calculateProrationAmount({
			periodEnd: end * 1000,
			periodStart: start * 1000,
			now: attachParams.now || Date.now(),
			amount,
			allowNegative: true,
		});

		const product = cusProductToProduct({ cusProduct });
		const feature = features.find(
			(f: Feature) => f.internal_id === newOptions.internal_feature_id,
		)!;
		const invoiceItem = constructStripeInvoiceItem({
			product,
			amount: amount,
			org: org,
			price: cusPrice.price,
			description: getFeatureInvoiceDescription({
				feature: feature,
				usage: newOptions.quantity,
				billingUnits: (cusPrice.price.config as UsagePriceConfig).billing_units,
				prodName: product.name,
				isPrepaid: true,
				fromUnix: attachParams.now,
			}),
			stripeSubId: stripeSub.id,
			stripeCustomerId: stripeSub.customer as string,
			periodStart: Math.floor(
				attachParams.now ? attachParams.now / 1000 : Date.now(),
			),
			periodEnd: Math.floor(end * 1000),
		});

		logger.info(
			`🔥 Creating downgrade prepaid invoice item: ${invoiceItem.description} - ${amount}`,
		);

		await stripeCli.invoiceItems.create(invoiceItem);

		if (shouldBillNow(onDecrease)) {
			const { invoice: finalInvoice } = await createAndFinalizeInvoice({
				stripeCli,
				stripeCusId: stripeSub.customer as string,
				stripeSubId: stripeSub.id,
				paymentMethod: paymentMethod || null,
				chargeAutomatically: !attachConfig.invoiceOnly,
				logger,
			});

			invoice = finalInvoice;

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
		}
	};

	await stripeCli.subscriptionItems.update(subItem.id, {
		quantity: Math.max(newSubItemQuantity, 0),
		// proration_behavior: stripeProration,
		proration_behavior: "none",
	});

	if (!shouldProrate(onDecrease)) {
		newOptions.upcoming_quantity = newOptions.quantity;
		newOptions.quantity = oldOptions.quantity;
		return;
	}

	await createDowngradeInvoice();

	const cusEnt = getRelatedCusEnt({
		cusPrice,
		cusEnts: cusProduct.customer_entitlements,
	});

	if (cusEnt) {
		const decrementBy = new Decimal(oldOptions.quantity)
			.minus(new Decimal(newOptions.quantity))
			.mul(billingUnits)
			.toNumber();

		await CusEntService.decrement({
			db,
			id: cusEnt.id,
			amount: decrementBy,
		});
	}
};
