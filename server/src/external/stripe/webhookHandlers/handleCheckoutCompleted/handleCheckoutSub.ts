import { ApiVersion, BillingType, type UsagePriceConfig } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
	findPriceFromPlaceholderId,
	findPriceFromStripeId,
} from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { constructSub } from "@/internal/subscriptions/subUtils.js";
import { getEmptyPriceItem } from "../../priceToStripeItem/priceToStripeItem.js";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";

export const handleCheckoutSub = async ({
	stripeCli,
	db,
	subscription,
	attachParams,
	logger,
}: {
	stripeCli: Stripe;
	db: DrizzleCli;
	subscription: Stripe.Subscription | null;
	attachParams: AttachParams;
	logger: any;
}) => {
	const { org, customer } = attachParams;

	if (!subscription) return;

	const { start, end } = subToPeriodStartEnd({ sub: subscription });

	await SubService.createSub({
		db,
		sub: constructSub({
			stripeId: subscription.id,
			usageFeatures: attachParams.itemSets?.[0]?.usageFeatures || [],
			orgId: org.id,
			env: attachParams.customer.env,
			currentPeriodStart: start,
			currentPeriodEnd: end,
		}),
	});

	const curSubItems = subscription.items.data;
	const itemsUpdate = [];

	for (const item of curSubItems) {
		const stripePriceId = item.price.id;

		const arrearProratedPrice = findPriceFromPlaceholderId({
			prices: attachParams.prices,
			placeholderId: stripePriceId,
		});

		if (arrearProratedPrice) {
			itemsUpdate.push({
				price: arrearProratedPrice.config.stripe_price_id!,
				quantity: 0,
			});

			itemsUpdate.push({
				id: item.id,
				deleted: true,
			});
			continue;
		}

		const arrearPrice = findPriceFromStripeId({
			prices: attachParams.prices,
			stripePriceId,
			billingType: BillingType.UsageInArrear,
		});

		if (
			arrearPrice &&
			(attachParams.internalEntityId ||
				attachParams.apiVersion === ApiVersion.V1_Beta)
		) {
			itemsUpdate.push({
				id: item.id,
				deleted: true,
			});

			const emptyPrice = (arrearPrice.config as UsagePriceConfig)
				.stripe_empty_price_id;

			itemsUpdate.push(
				emptyPrice
					? {
							price: emptyPrice,
							quantity: 0,
						}
					: (getEmptyPriceItem({ price: arrearPrice, org }) as any),
			);
		}
	}

	// let deletedCount = itemsUpdate.filter((item) => item.deleted).length;
	// if (deletedCount === curSubItems.length) {
	//   itemsUpdate = itemsUpdate.concat(
	//     getArrearItems({
	//       prices: attachParams.prices,
	//       interval: attachParams.itemSets?.[0]?.interval,
	//       intervalCount: attachParams.itemSets?.[0]?.intervalCount,
	//       org,
	//     })
	//   );
	// }

	if (itemsUpdate.length > 0) {
		await stripeCli.subscriptions.update(subscription.id, {
			items: itemsUpdate,
		});
	}

	if (subscription.billing_mode.type !== "flexible") {
		await stripeCli.subscriptions.migrate(subscription.id, {
			billing_mode: { type: "flexible" },
		});
	}

	return subscription;
};
