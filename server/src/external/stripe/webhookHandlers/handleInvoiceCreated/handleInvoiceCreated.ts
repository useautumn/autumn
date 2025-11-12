import {
	type AppEnv,
	BillingType,
	CusProductStatus,
	type Customer,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	type Organization,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
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

const handleInArrearProrated = async ({
	db,
	cusEnts,
	cusPrice,
	customer,
	org,
	env,
	invoice,
	usageSub,
	logger,
}: {
	db: DrizzleCli;

	cusEnts: FullCustomerEntitlement[];
	cusPrice: FullCustomerPrice;
	customer: Customer;
	org: Organization;
	env: AppEnv;
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

	// console.log("Invoice period start:\t", formatUnixToDateTime(invoice.period_start * 1000));
	// console.log("Invoice period end:\t", formatUnixToDateTime(invoice.period_end * 1000));
	// console.log("Sub period start:\t", formatUnixToDateTime(usageSub.current_period_start * 1000));
	// console.log("Sub period end:\t", formatUnixToDateTime(usageSub.current_period_end * 1000));

	// Check if invoice is for new subscription period by comparing billing period
	const { start: periodStart, end: periodEnd } = subToPeriodStartEnd({
		sub: usageSub,
	});
	const isNewPeriod = invoice.period_start !== periodStart;
	if (!isNewPeriod) {
		logger.info("Invoice is not for new subscription period, skipping...");
		return;
	}

	const feature = cusEnt.entitlement.feature;
	logger.info(
		`Handling invoice.created for in arrear prorated, feature: ${feature.id}`,
	);

	const deletedEntities = await EntityService.list({
		db,
		internalCustomerId: customer.internal_id!,
		inFeatureIds: [feature.internal_id!],
		isDeleted: true,
	});

	if (deletedEntities.length === 0) {
		logger.info("No deleted entities found");
		return;
	}

	logger.info(
		`✨ Handling in arrear prorated, customer ${customer.name}, org: ${org.slug}`,
	);

	logger.info(
		`Deleting entities, feature ${feature.id}, customer ${customer.id}, org ${org.slug}`,
		deletedEntities,
	);

	// Get linked cus ents

	for (const linkedCusEnt of cusEnts) {
		// isLinked
		const isLinked = linkedCusEnt.entitlement.entity_feature_id === feature.id;

		if (!isLinked) {
			continue;
		}

		logger.info(
			`Linked cus ent: ${linkedCusEnt.feature_id}, isLinked: ${isLinked}`,
		);

		// Delete cus ent ids
		const newEntities = structuredClone(linkedCusEnt.entities!);
		for (const entityId in newEntities) {
			if (deletedEntities.some((e) => e.id === entityId)) {
				delete newEntities[entityId];
			}
		}

		const updated = await CusEntService.update({
			db,
			id: linkedCusEnt.id,
			updates: {
				entities: newEntities,
			},
		});
		console.log(`Updated ${updated.length} cus ents`);

		logger.info(
			`Feature: ${feature.id}, customer: ${customer.id}, deleted entities from cus ent`,
		);
		linkedCusEnt.entities = newEntities;
	}

	await EntityService.deleteInInternalIds({
		db,
		internalIds: deletedEntities.map((e) => e.internal_id!),
		orgId: org.id,
		env,
	});
	logger.info(
		`Feature: ${feature.id}, Deleted ${
			deletedEntities.length
		}, entities: ${deletedEntities.map((e) => `${e.id}`).join(", ")}`,
	);

	// Increase balance
	if (notNullish(cusEnt.balance)) {
		logger.info(`Incrementing balance for cus ent: ${cusEnt.id}`);
		await CusEntService.increment({
			db,
			id: cusEnt.id,
			amount: deletedEntities.length,
		});
	}
};

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
	stripeSubs,
	logger,
}: {
	db: DrizzleCli;
	activeProduct: FullCusProduct;
	org: Organization;
	env: AppEnv;
	invoice: Stripe.Invoice;
	stripeSubs: Stripe.Subscription[];
	logger: any;
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
			});

			handled.push(handledUsage);
		}

		if (billingType === BillingType.InArrearProrated) {
			const handledContUse = await handleContUsePrices({
				db,
				stripeCli,
				cusEnts,
				cusPrice,
				invoice,
				usageSub: usageBasedSub,
				logger,
			});

			handled.push(handledContUse);
		}

		if (billingType === BillingType.UsageInAdvance) {
			const handledPrepaid = await handlePrepaidPrices({
				db,
				stripeCli,
				cusPrice,
				cusProduct: activeProduct,
				usageSub: usageBasedSub,
				customer,
				invoice,
				logger,
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

		const features = await FeatureService.list({
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
			// Skip balance reset for Vercel subscriptions - handled in marketplace.invoice.paid
			const subId = invoiceToSubId({ invoice });
			const subscription = stripeSubs.find((s) => s.id === subId);
			console.log("Found sub for sendUsageAndReset", subId);

			if (!validateProductShouldReset({ subscription, _invoice: invoice })) {
				console.log("Skipping sendUsageAndReset", subId);
				continue;
			}
			console.log("Sending sendUsageAndReset", subId);

			await sendUsageAndReset({
				db,
				activeProduct,
				org,
				env,
				stripeSubs,
				invoice,
				logger,
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
	if (subscription?.metadata?.vercel_installation_id) {
		console.log(
			"Skipping sendUsageAndReset for Vercel subscription",
			subscription.id,
			subscription.metadata.vercel_installation_id,
		);
		return false;
	}

	console.log(
		"Sending sendUsageAndReset for subscription because not a Vercel subscription",
		subscription?.id,
	);
	return true;
};
