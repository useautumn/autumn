import {
	AttachScenario,
	CusProductStatus,
	MetadataType,
	notNullish,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getOptionsFromCheckoutSession } from "./getOptionsFromCheckout.js";
import { handleCheckoutSub } from "./handleCheckoutSub.js";
import { handleRemainingSets } from "./handleRemainingSets.js";
import { handleSetupCheckout } from "./handleSetupCheckout.js";

export const handleLegacyCheckoutSessionMetadata = async ({
	ctx,
	checkoutContext,
}: {
	ctx: AutumnContext;
	checkoutContext: CheckoutSessionCompletedContext;
}) => {
	const { logger, db, org, env } = ctx;

	const { metadata, stripeCheckoutSession, stripeSubscription } =
		checkoutContext;
	if (metadata?.type !== MetadataType.CheckoutSessionCompleted) return;

	// Get options
	const stripeCli = createStripeCli({ org, env });
	const attachParams: AttachParams = metadata.data as AttachParams;

	attachParams.req = ctx as AutumnContext;
	attachParams.stripeCli = stripeCli;

	if (attachParams.org.id !== org.id) {
		logger.info("checkout.completed: org doesn't match, skipping");
		return;
	}

	if (attachParams.customer.env !== env) {
		logger.info("checkout.completed: environments don't match, skipping");
		return;
	}

	await getOptionsFromCheckoutSession({
		checkoutSession: stripeCheckoutSession,
		attachParams,
	});

	logger.info("Handling checkout session metadata v1: ", metadata?.id);

	if (attachParams.setupPayment) {
		await handleSetupCheckout({
			ctx,
			attachParams,
		});
		return;
	}

	// const checkoutSub = stripeSubscription ?? null;

	if (stripeSubscription) {
		const activeCusProducts = await CusProductService.getByStripeSubId({
			db: ctx.db,
			stripeSubId: stripeSubscription.id,
			orgId: org.id,
			env,
			inStatuses: [CusProductStatus.Active],
		});

		if (activeCusProducts && activeCusProducts.length > 0) {
			logger.info("✅ checkout.completed: subscription already exists");
			return true;
		}
	}

	await handleCheckoutSub({
		stripeCli,
		db,
		subscription: stripeSubscription ?? null,
		attachParams,
	});

	// Create other subscriptions
	const { invoiceIds } = await handleRemainingSets({
		stripeCli,
		org,
		checkoutSession: stripeCheckoutSession,
		attachParams,
		checkoutSub: stripeSubscription ?? null,
	});

	const anchorToUnix = stripeSubscription
		? getEarliestPeriodEnd({ sub: stripeSubscription }) * 1000
		: undefined;
	if (attachParams.productsList) {
		logger.info("Inserting products list");
		for (const productOptions of attachParams.productsList) {
			const product = attachParams.products.find(
				(p) => p.id === productOptions.product_id,
			);

			if (!product) {
				ctx.logger.error(
					`checkout.completed: product not found for productOptions: ${JSON.stringify(
						productOptions,
					)}`,
				);
				continue;
			}

			await createFullCusProduct({
				db,
				attachParams: attachToInsertParams(
					attachParams,
					product,
					productOptions.entity_id || undefined,
				),
				subscriptionIds: stripeSubscription
					? [stripeSubscription.id]
					: undefined,
				anchorToUnix,
				scenario: AttachScenario.New,
				productOptions,
				logger: ctx.logger,
			});
		}
	} else {
		const products = attachParams.products;
		for (const product of products) {
			await createFullCusProduct({
				db,
				attachParams: attachToInsertParams(attachParams, product),
				subscriptionIds: stripeSubscription
					? [stripeSubscription.id]
					: undefined,
				anchorToUnix,
				scenario: AttachScenario.New,
				logger: ctx.logger,
			});
		}
	}

	logger.info("✅ checkout.completed: successfully created cus product");
	const batchInsertInvoice: any = [];

	for (const invoiceId of invoiceIds) {
		batchInsertInvoice.push(
			insertInvoiceFromAttach({
				db,
				attachParams,
				invoiceId,
				logger,
			}),
		);
	}

	await Promise.all(batchInsertInvoice);
	logger.info("✅ checkout.completed: successfully inserted invoices");

	for (const product of attachParams.products) {
		logger.info("Adding task to queue for trigger checkout reward");
		await addTaskToQueue({
			jobName: JobName.TriggerCheckoutReward,
			payload: {
				// For createWorkerContext
				orgId: org.id,
				env: attachParams.customer.env,
				customerId: attachParams.customer.id,
				// For triggerCheckoutReward
				customer: attachParams.customer,
				product,
				subId: stripeSubscription?.id as string,
			},
		});
	}

	// If the customer in Autumn is missing metadata, and Stripe has atleast one of the fields, update the customer in Autumn
	// with whatever is present in Stripe.
	// Skip if both are missing in Stripe.

	const updates = {
		name:
			!attachParams.customer.name &&
			notNullish(stripeCheckoutSession.customer_details?.name)
				? stripeCheckoutSession.customer_details?.name
				: undefined,
		email:
			!attachParams.customer.email &&
			notNullish(stripeCheckoutSession.customer_details?.email)
				? stripeCheckoutSession.customer_details?.email
				: undefined,
	};

	if (updates.name || updates.email) {
		await CusService.update({
			db,
			idOrInternalId: attachParams.customer.internal_id,
			orgId: org.id,
			env,
			update: updates,
		});
	}
};
