import {
	type CollectionMethod,
	CusProductStatus,
	InternalError,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { handleSchedulePhaseCompleted } from "./handleSubUpdated/handleSchedulePhaseCompleted.js";
import { handleSubCanceled } from "./handleSubUpdated/handleSubCanceled.js";
import { handleSubPastDue } from "./handleSubUpdated/handleSubPastDue.js";
import { handleSubRenewed } from "./handleSubUpdated/handleSubRenewed.js";

export const handleSubscriptionUpdated = async ({
	ctx,
	subscription,
	previousAttributes,
}: {
	ctx: AutumnContext;
	subscription: Stripe.Subscription;
	// biome-ignore lint/suspicious/noExplicitAny: Don't know the type of previousAttributes
	previousAttributes: any;
}) => {
	const { db, org, env, logger } = ctx;
	// handle scheduled updated
	await handleSchedulePhaseCompleted({
		ctx,
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

	const updatedCusProducts = await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: subscription.id,
		updates: {
			status: subStatusMap[subscription.status] || CusProductStatus.Unknown,
			collection_method: fullSub.collection_method as CollectionMethod,
		},
	});

	// 2. Update canceled & canceled_at IF sub has no schedule...?

	if (updatedCusProducts.length > 0) {
		logger.info(
			`✅ sub.updated: updated ${updatedCusProducts.length} customer product(s)} (${updatedCusProducts[0].status})`,
			{
				data: {
					stripeSubId: subscription.id,
					updatedCusProducts: updatedCusProducts.map((cp) => ({
						id: cp.id,
						status: cp.status,
						canceled_at: cp.canceled_at,
						ended_at: cp.ended_at,
					})),
				},
			},
		);
	}

	await handleSubCanceled({
		ctx,
		previousAttributes,
		sub: fullSub,
		updatedCusProducts,
		org,
	});

	await handleSubPastDue({
		ctx,
		previousAttributes,
		sub: fullSub,
		updatedCusProducts,
		org,
	});

	await handleSubRenewed({
		ctx,
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
		if (
			!subscription.latest_invoice ||
			typeof subscription.latest_invoice !== "string"
		) {
			throw new InternalError({
				message: "subscription.latest_invoice is not a string",
			});
		}

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

		const validInvoiceReasons = ["subscription_cycle", "subscription_create"];
		if (!validInvoiceReasons.includes(latestInvoice.billing_reason ?? "")) {
			logger.info(
				"sub.updated, latest invoice billing reason isn't subscription_cycle / subscription_create, past_due not forcing cancel",
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
			if (latestInvoice.status === "open") {
				await stripeCli.invoices.voidInvoice(subscription.latest_invoice);
			}
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
