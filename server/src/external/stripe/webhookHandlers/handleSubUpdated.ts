import {
	type AppEnv,
	type CollectionMethod,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { handleSchedulePhaseCompleted } from "./handleSubUpdated/handleSchedulePhaseCompleted.js";
import {
	handleSubCanceled,
	isSubCanceled,
} from "./handleSubUpdated/handleSubCanceled.js";
import { handleSubRenewed } from "./handleSubUpdated/handleSubRenewed.js";

export const handleSubscriptionUpdated = async ({
	req,
	db,
	org,
	subscription,
	previousAttributes,
	env,
	logger,
}: {
	req: ExtendedRequest;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	subscription: any;
	previousAttributes: any;
	logger: any;
}) => {
	// handle scheduled updated
	await handleSchedulePhaseCompleted({
		req,
		subObject: subscription,
		prevAttributes: previousAttributes,
	});

	// Get cus products by stripe sub id
	const cusProducts = await CusProductService.getByStripeSubId({
		db,
		stripeSubId: subscription.id,
		orgId: org.id,
		env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	if (cusProducts.length === 0) return;

	// Handle syncing status
	const stripeCli = createStripeCli({
		org,
		env,
	});
	const fullSub = await stripeCli.subscriptions.retrieve(subscription.id);

	const subStatusMap: {
		[key: string]: CusProductStatus;
	} = {
		trialing: CusProductStatus.Active,
		active: CusProductStatus.Active,
		past_due: CusProductStatus.PastDue,
	};

	// 1. Fetch subscription
	const { canceled, canceledAt } = isSubCanceled({
		previousAttributes,
		sub: fullSub,
	});

	const updatedCusProducts = await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: subscription.id,
		updates: {
			status: subStatusMap[subscription.status] || CusProductStatus.Unknown,
			collection_method: fullSub.collection_method as CollectionMethod,
			// canceled_at: canceled ? canceledAt : null,
			// trial_ends_at:
			//   previousAttributes.status === "trialing" &&
			//   subscription.status === "active"
			//     ? null
			//     : undefined,
		},
	});

	// 2. Update canceled & canceled_at IF sub has no schedule...?

	if (updatedCusProducts.length > 0) {
		logger.info(
			`✅ Updated ${updatedCusProducts.length} customer product${updatedCusProducts.length === 1 ? "" : "s"} (${updatedCusProducts.map((cp) => cp.id).join(", ")}) - Status: ${updatedCusProducts[0].status}${updatedCusProducts[0].canceled_at ? `, Canceled: ${new Date(updatedCusProducts[0].canceled_at).toISOString()}` : ""}`,
		);
	}

	await handleSubCanceled({
		req,
		previousAttributes,
		sub: fullSub,
		updatedCusProducts,
		org,
	});

	await handleSubRenewed({
		req,
		prevAttributes: previousAttributes,
		sub: fullSub,
		updatedCusProducts,
	});

	try {
		await SubService.updateFromStripe({
			db,
			stripeSub: fullSub,
		});
	} catch (error) {
		logger.warn(
			`Failed to update sub from stripe. Stripe sub ID: ${subscription.id}, org: ${org.slug}, env: ${env}`,
			error,
		);
	}

	// Cancel subscription immediately
	if (subscription.status === "past_due" && org.config.cancel_on_past_due) {
		const stripeCli = createStripeCli({
			org,
			env,
		});

		const latestInvoice = await stripeCli.invoices.retrieve(
			subscription.latest_invoice,
		);

		logger.info(
			`Latest invoice billing reason: ${latestInvoice.billing_reason}`,
		);
		logger.info(`Latest invoice status: ${latestInvoice.status}`);

		if (
			latestInvoice.status !== "open" ||
			latestInvoice.billing_reason !== "subscription_cycle"
		) {
			logger.info(
				"sub.updated, latest invoice isn't open or billing reason isn't subscription_update, past_due not forcing cancel",
				{
					data: {
						subscriptionId: subscription.id,
						stripeSubId: subscription.id,
						latestInvoiceId: subscription.latest_invoice,
						latestInvoiceStatus: latestInvoice.status,
						latestInvoiceBillingReason: latestInvoice.billing_reason,
					},
				},
			);
			return;
		}

		try {
			logger.info(
				`sub.updated (past_due), cancelling subscription: ${subscription.id}`,
				{
					data: {
						subscriptionId: subscription.id,
						stripeSubId: subscription.id,
						latestInvoiceId: subscription.latest_invoice,
						latestInvoiceStatus: latestInvoice.status,
						latestInvoiceBillingReason: latestInvoice.billing_reason,
					},
				},
			);
			await stripeCli.subscriptions.cancel(subscription.id);
			await stripeCli.invoices.voidInvoice(subscription.latest_invoice);
		} catch (error: any) {
			logger.error(
				`subscription.updated: error cancelling / voiding: ${error.message}`,
				{
					data: {
						subscriptionId: subscription.id,
						stripeSubId: subscription.id,
						error: error.message,
						latestInvoiceId: subscription.latest_invoice,
						latestInvoiceStatus: latestInvoice.status,
						latestInvoiceBillingReason: latestInvoice.billing_reason,
					},
				},
			);
		}
	}
};

// server-1       | subscription.updated, previous attributes: { status: 'active' }
// server-1       | current period start: 8 Jul 2025
// server-1       | current period end: 8 Aug 2025
// server-1       | subscription.updated: past due, cancelling: sub_1Rig399mx3u0jkgOquNmw5fM

// server-1       | subscription.updated, previous attributes: { status: 'active' }
// server-1       | current period start: 8 Aug 2025
// server-1       | current period end: 8 Sep 2025
// server-1       | subscription.updated: past due, cancelling: sub_1Rig3z9mx3u0jkgOzJTci91r

// const lockKey = `sub_updated_${subscription.id}`;
// // Create a lock to prevent race conditions
// let lockAcquired = false;
// try {
//   let attempts = 0;

//   while (!lockAcquired && attempts < 3) {
//     lockAcquired = await getWebhookLock({ lockKey, logger });
//     if (!lockAcquired) {
//       attempts++;
//       console.log(
//         `sub.updated: failed to acquire lock for ${subscription.id}, attempt ${attempts}`,
//       );
//       if (attempts < 3) {
//         await new Promise((resolve) => setTimeout(resolve, 1000));
//       }
//     } else {
//       break;
//     }
//   }
// } catch (error) {
//   logger.error("lock error, setting lockAcquired to true");
//   lockAcquired = true;
// }

// if (!lockAcquired) {
//   throw new RecaseError({
//     message: `Failed to acquire lock for stripe webhook, sub.updated.`,
//     code: ErrCode.InvalidRequest,
//     statusCode: 400,
//   });
// }

// await releaseWebhookLock({ lockKey, logger });
