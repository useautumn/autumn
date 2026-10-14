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
import { ProductService } from "@/internal/products/ProductService.js";

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

	const product = await ProductService.getFull({
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

	const optionsList =
		metadata && Object.keys(metadata).length > 0
			? parseVercelPrepaidQuantities({
					metadata,
					product,
					prices: product.prices,
				})
			: [];

	const featureQuantities = optionsList.map((opt) => ({
		feature_id: opt.feature_id,
		quantity: opt.quantity,
	}));

	const contextOverride: BillingContextOverride = {
		productContext: {
			fullProduct: product,
		},
		stripeBillingContext: {
			stripeCustomer,
			stripeDiscounts: [],
		},
		skipCustomPaymentMethodGuard: true,
	};

	const result = await attach({
		ctx,
		params: {
			customer_id: customer.id || customer.internal_id,
			plan_id: billingPlanId,
			redirect_mode: "if_required",
			feature_quantities: featureQuantities,
			enable_plan_immediately: true,
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

	throw new RecaseError({
		message: "Failed to find created customer product after attach",
		code: "cus_product_not_found",
		statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
	});
};
