import {
	type AppEnv,
	AttachScenario,
	CusProductStatus,
	notNullish,
	type Organization,
} from "@autumn/shared";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getEarliestPeriodEnd } from "../stripeSubUtils/convertSubUtils.js";
import { getOptionsFromCheckoutSession } from "./handleCheckoutCompleted/getOptionsFromCheckout.js";
import { handleCheckoutSub } from "./handleCheckoutCompleted/handleCheckoutSub.js";
import { handleRemainingSets } from "./handleCheckoutCompleted/handleRemainingSets.js";
import { handleSetupCheckout } from "./handleCheckoutCompleted/handleSetupCheckout.js";

export const handleCheckoutSessionCompleted = async ({
	ctx,
	db,
	org,
	data,
	env,
}: {
	ctx: AutumnContext;
	db: DrizzleCli;
	org: Organization;
	data: Stripe.Checkout.Session;
	env: AppEnv;
}) => {
	const { logger } = ctx;
	const metadata = await getMetadataFromCheckoutSession(data, db);
	if (!metadata) {
		logger.info("checkout.completed: metadata not found, skipping");
		return;
	}

	// Get options
	const stripeCli = createStripeCli({ org, env });
	const attachParams: AttachParams = metadata.data;
	const checkoutSession = await stripeCli.checkout.sessions.retrieve(data.id, {
		expand: ["line_items", "subscription"],
	});

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
		checkoutSession,
		attachParams,
	});

	logger.info(
		"Handling checkout.completed: autumn metadata:",
		checkoutSession.metadata?.autumn_metadata_id,
	);

	if (attachParams.setupPayment) {
		await handleSetupCheckout({
			ctx,
			attachParams,
		});
		return;
	}

	const checkoutSub =
		checkoutSession.subscription as Stripe.Subscription | null;

	if (checkoutSub) {
		const activeCusProducts = await CusProductService.getByStripeSubId({
			db,
			stripeSubId: checkoutSub.id,
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
		subscription: checkoutSub,
		attachParams,
	});

	// Create other subscriptions
	const { invoiceIds } = await handleRemainingSets({
		stripeCli,
		org,
		checkoutSession,
		attachParams,
		checkoutSub,
	});

	const anchorToUnix = checkoutSub
		? getEarliestPeriodEnd({ sub: checkoutSub! }) * 1000
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
				subscriptionIds: checkoutSub ? [checkoutSub.id] : undefined,
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
				subscriptionIds: checkoutSub ? [checkoutSub.id] : undefined,
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
				customer: attachParams.customer,
				product,
				org,
				env: attachParams.customer.env,
				subId: checkoutSub?.id as string,
			},
		});
	}

	// If the customer in Autumn is missing metadata, and Stripe has atleast one of the fields, update the customer in Autumn
	// with whatever is present in Stripe.
	// Skip if both are missing in Stripe.

	const updates = {
		name:
			!attachParams.customer.name &&
			notNullish(checkoutSession.customer_details?.name)
				? checkoutSession.customer_details?.name
				: undefined,
		email:
			!attachParams.customer.email &&
			notNullish(checkoutSession.customer_details?.email)
				? checkoutSession.customer_details?.email
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
