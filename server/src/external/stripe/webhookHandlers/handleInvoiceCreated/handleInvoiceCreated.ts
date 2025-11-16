import {
	type AppEnv,
	BillingType,
	CusProductStatus,
	type FullCusProduct,
	type Organization,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { deleteCachedApiCustomer } from "../../../../internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import {
	getFullStripeInvoice,
	invoiceToSubId,
} from "../../stripeInvoiceUtils.js";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";
import { getStripeSubs } from "../../stripeSubUtils.js";
import { handleContUsePrices } from "./handleContUsePrices.js";
import { handlePrepaidPrices } from "./handlePrepaidPrices.js";
import { handleUsagePrices } from "./handleUsagePrices.js";

// For cancel at period end: invoice period start = sub period start (cur cycle), invoice period end = sub period end (a month later...)
// For cancel immediately: invoice period start = sub period start (cur cycle), invoice period end cancel immediately date
// For regular billing: invoice period end = sub period start (next cycle)
// For upgrade, bill_immediately: invoice period start = sub period start (cur cycle), invoice period end cancel immediately date

export const sendUsageAndReset = async ({
	db,
	activeProduct,
	org,
	env,
	invoice,
	logger,
	submitUsage = true,
	resetBalance = true,
}: {
	db: DrizzleCli;
	activeProduct: FullCusProduct;
	org: Organization;
	env: AppEnv;
	invoice: Stripe.Invoice;
	logger: any;
	submitUsage?: boolean;
	resetBalance?: boolean;
}) => {
	const stripeCli = createStripeCli({ org, env });

	const cusEnts = activeProduct.customer_entitlements;
	const cusPrices = activeProduct.customer_prices;
	const customer = activeProduct.customer!;

	const handled: boolean[] = [];
	for (const cusPrice of cusPrices) {
		const price = cusPrice.price;
		const billingType = getBillingType(price.config);

		if (isFixedPrice({ price })) continue;

		const relatedCusEnt = getRelatedCusEnt({
			cusPrice,
			cusEnts,
		});

		if (!relatedCusEnt) continue;

		const usageBasedSub = await cusProductToSub({
			cusProduct: activeProduct,
			stripeCli,
		});

		const subId = invoiceToSubId({ invoice });

		if (!usageBasedSub || usageBasedSub.id !== subId) continue;

		// If trial just ended, skip
		const { start } = subToPeriodStartEnd({ sub: usageBasedSub });

		if (usageBasedSub.trial_end === start) {
			logger.info(`Trial just ended, skipping usage invoice.created`);
			continue;
		}

		if (billingType === BillingType.UsageInArrear) {
			const handledUsage = await handleUsagePrices({
				db,
				org,
				invoice,
				customer,
				relatedCusEnt,
				stripeCli,
				price,
				usageSub: usageBasedSub,
				logger,
				activeProduct,
				submitUsage,
				resetBalance,
			});

			handled.push(handledUsage);
		}

		if (billingType === BillingType.InArrearProrated) {
			const handledContUse = await handleContUsePrices({
				db,
				cusEnts,
				cusPrice,
				invoice,
				usageSub: usageBasedSub,
				logger,
				resetBalance,
			});

			handled.push(handledContUse);
		}

		if (billingType === BillingType.UsageInAdvance) {
			const handledPrepaid = await handlePrepaidPrices({
				db,
				cusPrice,
				cusProduct: activeProduct,
				usageSub: usageBasedSub,
				invoice,
				logger,
				resetBalance,
			});

			handled.push(handledPrepaid);
		}
	}

	if (handled.some((h) => Boolean(h))) {
		await deleteCachedApiCustomer({
			customerId: customer.id!,
			orgId: org.id,
			env,
			source: `handleInvoiceCreated: ${invoice.id}`,
		});
	}
};

export const handleInvoiceCreated = async ({
	db,
	org,
	data,
	env,
	logger,
}: {
	db: DrizzleCli;
	org: Organization;
	data: Stripe.Invoice;
	env: AppEnv;
	logger: any;
}) => {
	const stripeCli = createStripeCli({ org, env });
	const invoice = await getFullStripeInvoice({
		stripeCli,
		stripeId: data.id!,
	});

	const subId = invoiceToSubId({ invoice });

	if (subId) {
		const activeProducts = await CusProductService.getByStripeSubId({
			db,
			stripeSubId: subId,
			orgId: org.id,
			env,
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.Expired,
				CusProductStatus.PastDue,
			],
		});

		if (activeProducts.length === 0) {
			logger.warn(
				`Stripe invoice.created -- no active products found (${org.slug})`,
			);
			return;
		}

		const internalEntityId = activeProducts.find(
			(p) => p.internal_entity_id,
		)?.internal_entity_id;

		await FeatureService.list({
			db,
			orgId: org.id,
			env,
		});

		if (internalEntityId) {
			// try {
			//   let stripeCli = createStripeCli({ org, env });
			//   let entity = await EntityService.getByInternalId({
			//     db,
			//     internalId: internalEntityId,
			//   });
			//   let feature = features.find(
			//     (f) => f.internal_id == entity?.internal_feature_id
			//   );
			//   let entDetails = "";
			//   if (entity.name) {
			//     entDetails = `${entity.name}${
			//       entity.id ? ` (ID: ${entity.id})` : ""
			//     }`;
			//   } else if (entity.id) {
			//     entDetails = `${entity.id}`;
			//   }
			//   if (entDetails && feature) {
			//     await stripeCli.invoices.update(invoice.id!, {
			//       description: `${getFeatureName({
			//         feature,
			//         plural: false,
			//         capitalize: true,
			//       })}: ${entDetails}`,
			//     });
			//   }
			// } catch (error: any) {
			//   if (
			//     error.message != "Finalized invoices can't be updated in this way"
			//   ) {
			//     logger.error(`Failed to add entity ID to invoice description`, error);
			//   }
			// }
		}

		const stripeSubs = await getStripeSubs({
			stripeCli: createStripeCli({ org, env }),
			subIds: activeProducts.flatMap((p) => p.subscription_ids || []),
		});

		for (const activeProduct of activeProducts) {
			const subId = invoiceToSubId({ invoice });
			const subscription = stripeSubs.find((s) => s.id === subId);

			await sendUsageAndReset({
				db,
				activeProduct,
				org,
				env,
				invoice,
				logger,
				submitUsage: true, // Always submit usage during invoice.created
				resetBalance: validateProductShouldReset({
					subscription,
					_invoice: invoice,
				}), // Skip balance reset for Vercel (wait for payment confirmation)
			});
		}
	}
};

export const validateProductShouldReset = ({
	subscription,
	_invoice,
}: {
	subscription?: Stripe.Subscription;
	_invoice: Stripe.Invoice;
}) => {
	/**
	 * This was separated so as to give us headroom to add further Custom Payment Methods in the future.
	 * e.g RevenueCat etc...
	 */
	if (subscription?.metadata?.vercel_installation_id) return false;
	return true;
};
