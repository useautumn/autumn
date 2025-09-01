import type { AppEnv } from "@autumn/shared";
import {
	BillingType,
	type FullCusProduct,
	type FullCustomerPrice,
	type Organization,
	type Price,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { generateId } from "@/utils/genUtils.js";
import { getStripeExpandedInvoice } from "../stripeInvoiceUtils.js";
import {
	getEarliestPeriodEnd,
	getEarliestPeriodStart,
} from "../stripeSubUtils/convertSubUtils.js";
import { getFullStripeSub } from "../stripeSubUtils.js";
import { createStripeCli } from "../utils.js";

export const handleSubCreated = async ({
	db,
	subData,
	org,
	env,
	logger,
}: {
	db: DrizzleCli;
	subData: Stripe.Subscription;
	org: Organization;
	env: AppEnv;
	logger: any;
}) => {
	const stripeCli = createStripeCli({ org, env });
	const subscription = await getFullStripeSub({
		stripeCli,
		stripeId: subData.id,
	});

	if (subscription.schedule) {
		const cusProds = await CusProductService.getByStripeScheduledId({
			db,
			stripeScheduledId: subscription.schedule as string,
			orgId: org.id,
			env,
		});

		if (!cusProds || cusProds.length === 0) {
			console.log("No cus prod found for scheduled id", subscription.schedule);
			return;
		}

		// Update autumn sub
		const autumnSub = await SubService.getFromScheduleId({
			db,
			scheduleId: subscription.schedule as string,
		});

		const earliestPeriodStart = getEarliestPeriodStart({ sub: subscription });
		const earliestPeriodEnd = getEarliestPeriodEnd({ sub: subscription });
		if (autumnSub) {
			await SubService.updateFromScheduleId({
				db,
				scheduleId: subscription.schedule as string,
				updates: {
					stripe_id: subscription.id,
					current_period_start: earliestPeriodStart,
					current_period_end: earliestPeriodEnd,
				},
			});
		} else {
			let subUsageFeatures = [];
			try {
				subUsageFeatures = JSON.parse(subscription.metadata?.usage_features);
				subUsageFeatures = subUsageFeatures.map(
					(feature: any) => feature.internal_id,
				);
			} catch (error) {
				console.log("Error parsing usage features", error);
			}

			await SubService.createSub({
				db,
				sub: {
					id: generateId("sub"),
					created_at: Date.now(),
					stripe_id: subscription.id,
					stripe_schedule_id: subscription.schedule as string,
					usage_features: subUsageFeatures,
					org_id: org.id,
					env: env,
					current_period_start: earliestPeriodStart,
					current_period_end: earliestPeriodEnd,
				},
			});
		}

		console.log(
			"Handling subscription.created for scheduled cus products:",
			cusProds.length,
		);

		const batchUpdate = [];
		for (const cusProd of cusProds) {
			const subIds = cusProd.subscription_ids
				? [...cusProd.subscription_ids]
				: [];
			subIds.push(subscription.id);

			const updateCusProd = async () => {
				await CusProductService.update({
					db,
					cusProductId: cusProd.id,
					updates: {
						subscription_ids: subIds,
					},
				});

				// Fetch latest invoice?
				const stripeCli = createStripeCli({ org, env });
				const invoice = await getStripeExpandedInvoice({
					stripeCli,
					stripeInvoiceId: subscription.latest_invoice as string,
				});

				const invoiceItems = await getInvoiceItems({
					stripeInvoice: invoice,
					prices: cusProd.customer_prices.map(
						(cpr: FullCustomerPrice) => cpr.price,
					),
					logger,
				});

				await InvoiceService.createInvoiceFromStripe({
					db,
					stripeInvoice: invoice,
					internalCustomerId: cusProd.internal_customer_id,
					internalEntityId: cusProd.internal_entity_id,
					productIds: [cusProd.product_id],
					internalProductIds: [cusProd.internal_product_id],
					org,
					items: invoiceItems,
				});
			};

			batchUpdate.push(updateCusProd());
		}

		await Promise.all(batchUpdate);
	}

	// Get cus prods for sub
	const cusProds = await CusProductService.getByStripeSubId({
		db,
		stripeSubId: subscription.id,
		orgId: org.id,
		env,
	});

	const handleInArrearWithEntity = async (cusProd: FullCusProduct) => {
		if (!cusProd.internal_entity_id) {
			return;
		}

		const arrearPrices = cusProd.customer_prices
			.map((cp) => cp.price)
			.filter(
				(p: Price) =>
					getBillingType(p.config as any) === BillingType.UsageInArrear,
			);

		if (arrearPrices.length === 0) {
			return;
		}

		const itemsToDelete = [];
		for (const arrearPrice of arrearPrices) {
			const subItem = subscription.items.data.find(
				(i) => i.price.id === arrearPrice.config?.stripe_price_id,
			);

			if (!subItem) {
				continue;
			}

			itemsToDelete.push({
				id: subItem.id,
				deleted: true,
			});
		}

		if (itemsToDelete.length > 0) {
			try {
				await stripeCli.subscriptions.update(subscription.id, {
					items: itemsToDelete,
				});
				console.log(
					`sub.created, cus product with entity: deleted ${itemsToDelete.length} items`,
				);
			} catch (error) {
				logger.error(
					`sub.created, cus product with entity: failed to delete items`,
					error,
				);
			}
		}
	};

	const batchUpdate = [];
	for (const cusProd of cusProds) {
		batchUpdate.push(handleInArrearWithEntity(cusProd));
	}

	await Promise.all(batchUpdate);
};
