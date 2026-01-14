import {
	ACTIVE_STATUSES,
	type CollectionMethod,
	CusProductStatus,
	formatMs,
	InternalError,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription.js";
import { stripeSubscriptionToTrialEndsAtMs } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import { CusService } from "@/internal/customers/CusService.js";
import {
	CusProductService,
	RELEVANT_STATUSES,
} from "@/internal/customers/cusProducts/CusProductService.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { handleSchedulePhaseCompleted } from "./handleSchedulePhaseCompleted.js";
import { handleSubCanceled } from "./handleSubCanceled.js";
import { handleSubPastDue } from "./handleSubPastDue.js";
import { handleSubRenewed } from "./handleSubRenewed.js";

export const handleSubscriptionUpdated = async ({
	ctx,
	eventData,
}: {
	ctx: AutumnContext;
	eventData: Stripe.Event.Data;
}) => {
	const previousAttributes = eventData.previous_attributes;
	const { db, org, env, logger } = ctx;

	const fullCustomer = await CusService.getFull({
		db,
		idOrInternalId: ctx.customerId ?? "",
		orgId: org.id,
		env,
		inStatuses: RELEVANT_STATUSES,
	});

	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId: (eventData.object as Stripe.Subscription).id,
	});

	// handle scheduled updated
	await handleSchedulePhaseCompleted({
		ctx,
		stripeSubscription,
		prevAttributes: previousAttributes,
		fullCustomer,
	});

	// Get cus products by stripe sub id
	const cusProducts = await CusProductService.getByStripeSubId({
		db,
		stripeSubId: stripeSubscription.id,
		orgId: org.id,
		env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	if (cusProducts.length === 0) return;

	const subStatusMap: {
		[key: string]: CusProductStatus;
	} = {
		trialing: CusProductStatus.Active,
		active: CusProductStatus.Active,
		past_due: CusProductStatus.PastDue,
		incomplete: CusProductStatus.PastDue, // temporary status for incomplete subscription
	};

	const trialEndsAtMs = stripeSubscriptionToTrialEndsAtMs({
		stripeSubscription,
	});
	ctx.logger.info(
		`SUB.UPDATED: Setting trial ends to: ${formatMs(trialEndsAtMs)}`,
	);

	const updatedCusProducts = await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: stripeSubscription.id,
		inStatuses: ACTIVE_STATUSES,
		updates: {
			status: subStatusMap[stripeSubscription.status] ?? undefined, // don't change status if it's unknown
			collection_method:
				stripeSubscription.collection_method as CollectionMethod,
			trial_ends_at: trialEndsAtMs,
		},
	});

	// 2. Update canceled & canceled_at IF sub has no schedule...?

	if (updatedCusProducts.length > 0) {
		logger.info(
			`✅ sub.updated: updated ${updatedCusProducts.length} customer product(s)} (${updatedCusProducts[0].status})`,
		);
	}

	await handleSubCanceled({
		ctx,
		previousAttributes,
		sub: stripeSubscription,
		updatedCusProducts: cusProducts,
		org,
	});

	await handleSubPastDue({
		ctx,
		previousAttributes,
		sub: stripeSubscription,
		updatedCusProducts: cusProducts,
		org,
	});

	await handleSubRenewed({
		ctx,
		prevAttributes: previousAttributes,
		sub: stripeSubscription,
		updatedCusProducts: cusProducts,
	});

	try {
		await SubService.updateFromStripe({
			db,
			stripeSub: stripeSubscription,
		});
	} catch (error) {
		logger.warn(
			`Failed to update sub from stripe. Stripe sub ID: ${stripeSubscription.id}, org: ${org.slug}, env: ${env}`,
			error,
		);
	}

	// Cancel subscription immediately

	if (
		stripeSubscription.status === "past_due" &&
		org.config.cancel_on_past_due
	) {
		if (
			!stripeSubscription.latest_invoice ||
			typeof stripeSubscription.latest_invoice !== "string"
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
			stripeSubscription.latest_invoice,
		);

		logger.info(
			`Latest invoice billing reason: ${latestInvoice.billing_reason}`,
		);

		const validInvoiceReasons = ["subscription_cycle", "subscription_create"];
		if (!validInvoiceReasons.includes(latestInvoice.billing_reason ?? "")) {
			logger.info(
				`sub.updated, latest invoice billing reason isn't subscription_cycle / subscription_create, past_due not forcing cancel`,
			);
			return;
		}

		try {
			logger.info(
				`sub.updated (past_due), cancelling subscription: ${stripeSubscription.id}`,
			);
			await stripeCli.subscriptions.cancel(stripeSubscription.id);
			if (latestInvoice.status === "open") {
				await stripeCli.invoices.voidInvoice(stripeSubscription.latest_invoice);
			}
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			logger.error(
				`subscription.updated: error cancelling / voiding: ${errMsg}`,
			);
		}
	}
};
