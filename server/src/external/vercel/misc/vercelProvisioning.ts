import type {
	BillingContextOverride,
	FullCusProduct,
	FullCustomer,
	FullProduct,
} from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { parseVercelPrepaidQuantities } from "@/external/vercel/misc/vercelInvoicing.js";
import { ensureVercelInvoiceModeSubscription } from "@/external/vercel/misc/vercelStripeInvoiceMode.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { PlanService } from "@/internal/products/PlanService.js";

/**
 * Provisions a Vercel customer product via V2 attach.
 *
 * Idempotency-checks via existing Stripe subscription metadata, then calls V2
 * `attach()` in invoice mode (`send_invoice`). Vercel marketplace moves the
 * money; Stripe is the ledger. The legacy custom-payment-method path is no
 * longer required for provisioning.
 */
export const provisionVercelCusProduct = async ({
	ctx,
	customer,
	stripeCustomer,
	stripeCli,
	integrationConfigurationId,
	billingPlanId,
	resourceId,
	metadata,
}: {
	ctx: AutumnContext;
	customer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	stripeCli: Stripe;
	integrationConfigurationId: string;
	billingPlanId: string;
	resourceId?: string;
	metadata?: Record<string, unknown>;
}): Promise<{
	subscription: Stripe.Subscription | null;
	cusProduct: FullCusProduct;
	product: FullProduct;
}> => {
	const { db, org, env } = ctx;

	// 1. Look up product (hoisted — reused by idempotency branch and free path)
	const product = await PlanService.getFull({
		db,
		orgId: org.id,
		env,
		idOrInternalId: billingPlanId,
	});
	if (!product) {
		throw new RecaseError({
			message: `Product not found for billing plan ${billingPlanId}`,
			code: ErrCode.ProductNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	// 2. Idempotency check via existing subscription
	const existingSub = stripeCustomer.subscriptions?.data.find(
		(s) =>
			s.metadata.vercel_installation_id === integrationConfigurationId &&
			s.status !== "incomplete_expired" &&
			s.status !== "canceled",
	);

	if (existingSub) {
		const existingCusProducts = await customerProductRepo.getByStripeSubId({
			db,
			stripeSubId: existingSub.id,
			orgId: org.id,
			env,
		});

		// Lazily migrate existing Vercel subs to invoice mode before short-circuit.
		// Idempotent — no-op if already `send_invoice`.
		const migratedSub = await ensureVercelInvoiceModeSubscription({
			ctx,
			stripeCli,
			subscription: existingSub,
		});

		if (existingCusProducts.length > 0) {
			return {
				subscription: migratedSub,
				cusProduct: existingCusProducts[0],
				product,
			};
		}

		// A subscription exists for this installation but no cus_product yet.
		// This is almost always a concurrent in-flight provision: the marketplace
		// safety-net webhooks (invoice.created / invoice.paid) can fire BEFORE
		// the original POST /resources call has run executeAutumnBillingPlan.
		// We must NOT cancel that subscription — Vercel is already processing
		// payment against it.
		//
		// Skip provisioning and let the in-flight call finish. The next webhook
		// retry (Vercel re-delivers paid events) will see the cus_product and
		// short-circuit on the early-return above.
		ctx.logger.info(
			"[provisionVercelCusProduct] Existing sub without cus_product — skipping (likely in-flight provision elsewhere)",
			{
				data: {
					subscriptionId: migratedSub.id,
					subscriptionStatus: migratedSub.status,
					installationId: integrationConfigurationId,
				},
			},
		);
		throw new RecaseError({
			message: "Vercel subscription is still being provisioned. Retry shortly.",
			code: "vercel_provisioning_in_flight",
			statusCode: StatusCodes.CONFLICT,
		});
	}

	// 3. Parse prepaid options
	const optionsList =
		metadata && Object.keys(metadata).length > 0
			? parseVercelPrepaidQuantities({
					metadata,
					product,
					prices: product.prices,
				})
			: [];

	// 4. Call V2 attach in invoice mode
	const featureQuantities = optionsList.map((opt) => ({
		feature_id: opt.feature_id,
		quantity: opt.quantity,
	}));

	// Note: we intentionally do NOT override `fullCustomer` here. V2's
	// `setupFullCustomerContext` reloads it with `withEntities: true, withSubs: true`,
	// which downstream usage merging requires. Overriding would skip that load and
	// cause `mergeEntitiesWithExistingUsages` to throw on `undefined` entities.
	//
	// We pass a stripeBillingContext WITHOUT a payment method. Vercel handles
	// money movement out of band; Stripe is just the ledger. Invoice mode
	// (`send_invoice`) auto-activates the subscription regardless of first
	// invoice status, so we don't need default_incomplete + custom-PM gymnastics.
	const contextOverride: BillingContextOverride = {
		productContext: {
			fullProduct: product,
		},
		stripeBillingContext: {
			stripeCustomer,
			stripeDiscounts: [],
		},
		// We ARE the Vercel origin platform — opt out of the "billed outside Stripe" guard.
		skipCustomPaymentMethodGuard: true,
	};

	const result = await attach({
		ctx,
		params: {
			customer_id: customer.id || customer.internal_id,
			plan_id: billingPlanId,
			redirect_mode: "if_required",
			feature_quantities: featureQuantities,
			// Top-level enable_plan_immediately keeps the Autumn cus_product
			// active on attach. Without it we'd wait for the first invoice to be
			// paid before granting access, which breaks Vercel UX.
			enable_plan_immediately: true,
			// Invoice mode puts the Stripe subscription into `send_invoice`
			// collection (no auto-charge), finalizes the first invoice so the
			// finalize webhook fires and we submit the invoice to Vercel, and
			// keeps the sub active without needing a payment intent.
			invoice_mode: {
				enabled: true,
				finalize: true,
				enable_plan_immediately: true,
			},
			metadata: {
				vercel_installation_id: integrationConfigurationId,
				vercel_billing_plan_id: billingPlanId,
				vercel_product_id: product.id,
				vercel_resource_id: resourceId || integrationConfigurationId,
			},
		},
		contextOverride,
		skipAutumnCheckout: true,
	});

	// 5. Extract subscription and cus_product
	const subscription = result.billingResult?.stripe?.stripeSubscription ?? null;

	if (subscription) {
		const newCusProducts = await customerProductRepo.getByStripeSubId({
			db,
			stripeSubId: subscription.id,
			orgId: org.id,
			env,
		});

		if (newCusProducts.length > 0) {
			return { subscription, cusProduct: newCusProducts[0], product };
		}
	}

	// Free product path: look up cus_product by customer + product
	const freeCusProducts = await customerProductRepo.getByCustomerAndProduct({
		db,
		internalCustomerId: customer.internal_id,
		internalProductId: product.internal_id,
		orgId: org.id,
		env,
		inStatuses: ["active", "trialing"],
	});

	if (freeCusProducts.length > 0) {
		return {
			subscription: null,
			cusProduct: freeCusProducts[0],
			product,
		};
	}

	// Should not reach here if attach succeeded
	throw new RecaseError({
		message: "Failed to find created customer product after attach",
		code: "cus_product_not_found",
		statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
	});
};
