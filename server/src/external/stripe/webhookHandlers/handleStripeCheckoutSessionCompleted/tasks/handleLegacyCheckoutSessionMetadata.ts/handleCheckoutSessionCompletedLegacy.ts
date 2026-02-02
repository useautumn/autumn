import {
	AttachScenario,
	CusProductStatus,
	type Customer,
	type FullProduct,
	MetadataType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext.js";
import { handleStandaloneSetupCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleLegacyCheckoutSessionMetadata.ts/handleStandaloneSetupCheckout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { getOptionsFromCheckoutSession } from "./getOptionsFromCheckout.js";
import { handleCheckoutSub } from "./handleCheckoutSub.js";
import { handleRemainingSets } from "./handleRemainingSets.js";
import { handleSetupCheckout } from "./handleSetupCheckout.js";

export interface LegacyCheckoutSessionResult {
	customer: Customer;
	products: FullProduct[];
}

export const handleLegacyCheckoutSessionMetadata = async ({
	ctx,
	checkoutContext,
}: {
	ctx: AutumnContext;
	checkoutContext: CheckoutSessionCompletedContext;
}): Promise<LegacyCheckoutSessionResult | null> => {
	const { logger, db, org, env } = ctx;

	const { metadata, stripeCheckoutSession, stripeSubscription } =
		checkoutContext;

	if (!metadata) {
		if (checkoutContext.stripeCheckoutSession.mode === "setup") {
			logger.info(
				"checkout.completed: setup mode without metadata, handling standalone setup",
			);
			await handleStandaloneSetupCheckout({
				ctx,
				checkoutSession: checkoutContext.stripeCheckoutSession,
			});
			return null;
		}
		logger.info("checkout.completed: metadata not found, skipping");
		return null;
	}

	if (metadata.type !== MetadataType.CheckoutSessionCompleted) return null;

	// Get options
	const stripeCli = createStripeCli({ org, env });
	const attachParams: AttachParams = metadata.data as AttachParams;

	attachParams.req = ctx as AutumnContext;
	attachParams.stripeCli = stripeCli;

	if (attachParams.org.id !== org.id) {
		logger.info("checkout.completed: org doesn't match, skipping");
		return null;
	}

	if (attachParams.customer.env !== env) {
		logger.info("checkout.completed: environments don't match, skipping");
		return null;
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
		return null;
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
			return null;
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

	// Return data needed for reward and customer update tasks (handled at top level)
	return {
		customer: attachParams.customer,
		products: attachParams.products,
	};
};
