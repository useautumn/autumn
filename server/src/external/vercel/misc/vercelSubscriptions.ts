import {
	type AppEnv,
	type Feature,
	type FullCustomer,
	type FullProduct,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { ErrCode } from "@shared/enums/ErrCode.js";
import type { Context } from "hono";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { createStripeSub2 } from "@/internal/customers/attach/attachFunctions/addProductFlow/createStripeSub2.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getNewVercelAttachBody } from "./vercelInvoicing.js";

/**
 * Creates a Stripe subscription for Vercel marketplace integration (installation-level billing only)
 *
 * Flow:
 * 1. Validates no existing subscription exists for this installation
 * 2. Gets product and custom payment method
 * 3. Creates Stripe subscription with collection_method: "charge_automatically"
 * 4. Returns subscription (status: "incomplete" until payment confirmed)
 *
 * Used by:
 * - handleUpdateBillingPlan (PATCH /installations/{id}) - for new subscriptions
 * - handleCreateResource (POST /installations/{id}/resources) - creates installation-level subscription
 *
 * Future: handleUpdateBillingPlan will also handle upgrades/downgrades when subscription exists
 */
export const createVercelSubscription = async ({
	db,
	org,
	env,
	customer,
	stripeCustomer,
	stripeCli,
	integrationConfigurationId,
	billingPlanId,
	features,
	logger,
	c,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	stripeCli: Stripe;
	integrationConfigurationId: string;
	billingPlanId: string;
	features: Feature[];
	logger: any;
	c: Context<HonoEnv>;
}): Promise<{ subscription: Stripe.Subscription; product: FullProduct }> => {
	logger.info("Creating Vercel subscription", {
		billingPlanId,
		integrationConfigurationId,
	});

	// 1. Check for existing subscription (only allow one per installation)
	const existingSubscription = stripeCustomer.subscriptions?.data.find(
		(s) => s.metadata.vercel_installation_id === integrationConfigurationId,
	);

	if (existingSubscription) {
		logger.warn("Subscription already exists for this installation", {
			subscriptionId: existingSubscription.id,
			status: existingSubscription.status,
		});
		throw new RecaseError({
			message: "A subscription already exists for this installation",
			code: "subscription_already_exists",
			statusCode: StatusCodes.CONFLICT,
		});
	}

	// 2. Get product
	const product = await ProductService.getFull({
		db,
		orgId: org.id,
		env,
		idOrInternalId: billingPlanId,
	});

	if (!product) {
		throw new RecaseError({
			message: `Product not found for billing plan ${billingPlanId}`,
			code: "product_not_found",
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	// 3. Get custom payment method (created in handleUpsertInstallation)
	const customPaymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: customer.processor.id,
		errorIfNone: false,
		typeFilter: org.processor_configs?.vercel?.custom_payment_method?.[env],
	});

	if (!customPaymentMethod) {
		logger.error("No custom payment method found for Vercel customer");
		throw new RecaseError({
			message:
				"No payment method found. Customer may need to reinstall integration.",
			code: ErrCode.PaymentMethodNotFound,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	logger.info("Found custom payment method", {
		paymentMethodId: customPaymentMethod.id,
		type: customPaymentMethod.type,
	});

	// 4. Build attach params and config (installation-level, no resourceId)
	const { attachParams, config } = getNewVercelAttachBody({
		stripeCli,
		stripeCustomer,
		now: Date.now(),
		org,
		customer,
		product,
		features,
		integrationConfigurationId,
		billingPlanId,
		db,
		env,
		c,
		customPaymentMethod,
	});

	// 5. Get subscription items
	const itemSet = await getStripeSubItems2({
		attachParams,
		config,
	});

	// 6. Create Stripe subscription
	const subscription = await createStripeSub2({
		db,
		stripeCli,
		attachParams,
		config,
		itemSet,
		logger,
	});

	logger.info("Subscription created with custom payment method", {
		subscriptionId: subscription.id,
		status: subscription.status,
		latestInvoiceId:
			typeof subscription.latest_invoice === "string"
				? subscription.latest_invoice
				: subscription.latest_invoice?.id,
	});

	// Subscription will be 'incomplete' initially with an 'open' invoice
	// Payment flow:
	//   1. invoice.finalized webhook → handleInvoiceFinalized submits invoice to Vercel
	//   2. Vercel processes payment (async)
	//   3. marketplace.invoice.paid webhook → handleMarketplaceInvoicePaid:
	//      - Creates cus_product (user gets access)
	//      - Reports payment to Stripe via Payment Records API
	//      - Attaches payment record to invoice
	//   4. Invoice becomes 'paid' → Subscription becomes 'active'

	return { subscription, product };
};

/**
 * Updates a Stripe subscription for Vercel marketplace integration (installation-level billing only)
 *
 * Flow:
 * 1. Validates existing subscription exists for this installation
 * 2. Gets old product, new product and custom payment method
 * 3. Determines if upgrade or downgrade is needed using isProductUpgrade
 * 3. Updates Stripe subscription with collection_method: "charge_automatically"
 * 4. Returns subscription (status: "incomplete" until payment confirmed)
 *
 * Used by:
 * - handleUpdateBillingPlan (PATCH /installations/{id}) - for new subscriptions
 * - handleCreateResource (POST /installations/{id}/resources) - creates installation-level subscription
 *
 * Future: handleUpdateBillingPlan will also handle upgrades/downgrades when subscription exists
 */
export const updateVercelSubscription = async ({
	db,
	org,
	env,
	customer,
	stripeCustomer,
	stripeCli,
	integrationConfigurationId,
	billingPlanId,
	features,
	logger,
	c,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	stripeCli: Stripe;
	integrationConfigurationId: string;
	billingPlanId: string;
	features: Feature[];
	logger: any;
	c: Context<HonoEnv>;
}): Promise<{ subscription: Stripe.Subscription; product: FullProduct }> => {
	logger.info("Creating Vercel subscription", {
		billingPlanId,
		integrationConfigurationId,
	});

	// 1. Check for existing subscription (only allow one per installation)
	const existingSubscription = stripeCustomer.subscriptions?.data.find(
		(s) => s.metadata.vercel_installation_id === integrationConfigurationId,
	);

	if (existingSubscription) {
		logger.warn("Subscription already exists for this installation", {
			subscriptionId: existingSubscription.id,
			status: existingSubscription.status,
		});
		throw new RecaseError({
			message: "A subscription already exists for this installation",
			code: "subscription_already_exists",
			statusCode: StatusCodes.CONFLICT,
		});
	}

	// 2. Get product
	const product = await ProductService.getFull({
		db,
		orgId: org.id,
		env,
		idOrInternalId: billingPlanId,
	});

	if (!product) {
		throw new RecaseError({
			message: `Product not found for billing plan ${billingPlanId}`,
			code: "product_not_found",
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	// 3. Get custom payment method (created in handleUpsertInstallation)
	const customPaymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: customer.processor.id,
		errorIfNone: false,
		typeFilter: org.processor_configs?.vercel?.custom_payment_method?.[env],
	});

	if (!customPaymentMethod) {
		logger.error("No custom payment method found for Vercel customer");
		throw new RecaseError({
			message:
				"No payment method found. Customer may need to reinstall integration.",
			code: ErrCode.PaymentMethodNotFound,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	logger.info("Found custom payment method", {
		paymentMethodId: customPaymentMethod.id,
		type: customPaymentMethod.type,
	});

	// 4. Build attach params and config (installation-level, no resourceId)
	const { attachParams, config } = getNewVercelAttachBody({
		stripeCli,
		stripeCustomer,
		now: Date.now(),
		org,
		customer,
		product,
		features,
		integrationConfigurationId,
		billingPlanId,
		db,
		env,
		c,
		customPaymentMethod,
	});

	// 5. Get subscription items
	const itemSet = await getStripeSubItems2({
		attachParams,
		config,
	});

	// 6. Create Stripe subscription
	const subscription = await createStripeSub2({
		db,
		stripeCli,
		attachParams,
		config,
		itemSet,
		logger,
	});

	logger.info("Subscription created with custom payment method", {
		subscriptionId: subscription.id,
		status: subscription.status,
		latestInvoiceId:
			typeof subscription.latest_invoice === "string"
				? subscription.latest_invoice
				: subscription.latest_invoice?.id,
	});

	// Subscription will be 'incomplete' initially with an 'open' invoice
	// Payment flow:
	//   1. invoice.finalized webhook → handleInvoiceFinalized submits invoice to Vercel
	//   2. Vercel processes payment (async)
	//   3. marketplace.invoice.paid webhook → handleMarketplaceInvoicePaid:
	//      - Creates cus_product (user gets access)
	//      - Reports payment to Stripe via Payment Records API
	//      - Attaches payment record to invoice
	//   4. Invoice becomes 'paid' → Subscription becomes 'active'

	return { subscription, product };
};

//   // Get old billing plan from subscription metadata
//   const oldBillingPlanId = existingSubscription.metadata.vercel_billing_plan_id;
//   if (oldBillingPlanId === billingPlanId) {
//     return c.json({ notification: { level: "info", message: "Already on this plan" }});
//   }

//   // Get old cus_product
//   const oldCusProduct = customer.customer_products?.find(
//     cp => cp.subscription_ids?.includes(existingSubscription.id) &&
//           cp.status === CusProductStatus.Active
//   );

//   // Get new product
//   const newProduct = await ProductService.getFull({
//     db, orgId: org.id, env, idOrInternalId: billingPlanId
//   });

//   // Determine upgrade vs downgrade
//   const isUpgrade = isProductUpgrade({
//     prices1: cusProductToPrices({ cusProduct: oldCusProduct }),
//     prices2: newProduct.prices,
//   });

//   // Build AttachParams (similar to createVercelSubscription)
//   const { attachParams, config } = getNewVercelAttachBody({
//     // ... same params as create flow
//     cusProduct: oldCusProduct,  // KEY: include old product
//     replaceables: [{
//       cusProduct: oldCusProduct,
//       product: oldProduct,
//       prices: oldProduct.prices,
//     }],
//   });

//   // Override config for upgrade/downgrade
//   config.branch = isUpgrade ? AttachBranch.Upgrade : AttachBranch.Downgrade;
//   config.proration = ProrationBehavior.Immediately;  // Or NextBilling

//   // Call upgrade flow
//   const result = await handleUpgradeFlow({
//     req: { db, stripeCli, logger },
//     res: {},
//     attachParams,
//     config,
//   });

//   return c.json({ message: "Plan updated successfully" });
