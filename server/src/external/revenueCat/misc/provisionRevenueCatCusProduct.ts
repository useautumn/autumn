import {
	type BillingContextOverride,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

/**
 * Provisions a RevenueCat customer product via V2 attach.
 *
 * RC payments happen on App Store / Play Store / etc., so Autumn never reads
 * or writes Stripe state for these flows. We funnel through V2 `attach()` so
 * the new cus_product, entitlements, prices, line items, webhooks, and rollover
 * carry-overs all run through the same pipeline as Stripe/Vercel, just with
 * the Stripe and external-PSP guards disabled.
 *
 * Handles new / upgrade / downgrade scenarios via `computeAttachPlan`'s
 * transition logic — the caller does not need to expire the outgoing
 * cus_product manually.
 */
export const provisionRevenueCatCusProduct = async ({
	ctx,
	customer,
	product,
	revenuecatMetadata,
}: {
	ctx: AutumnContext;
	customer: FullCustomer;
	product: FullProduct;
	revenuecatMetadata?: Record<string, string>;
}): Promise<{ cusProduct: FullCusProduct; product: FullProduct }> => {
	const { db, org, env } = ctx;

	// `resolveRevenuecatResources` loads `customer` with `withEntities: true`, which
	// is what `setupFullCustomerContext` would do anyway. Passing it as an override
	// skips a redundant DB fetch.
	const contextOverride: BillingContextOverride = {
		fullCustomer: customer,
		productContext: { fullProduct: product },
		skipBillingFetching: true,
		skipExternalPSPGuard: true,
		processorTypeOverride: ProcessorType.RevenueCat,
	};

	await attach({
		ctx,
		params: {
			customer_id: customer.id || customer.internal_id,
			plan_id: product.id,
			redirect_mode: "if_required",
			no_billing_changes: true,
			enable_plan_immediately: true,
			...(revenuecatMetadata ? { metadata: revenuecatMetadata } : {}),
		},
		contextOverride,
		skipAutumnCheckout: true,
	});

	const cusProducts = await customerProductRepo.getByCustomerAndProduct({
		db,
		internalCustomerId: customer.internal_id,
		internalProductId: product.internal_id,
		orgId: org.id,
		env,
		inStatuses: ["active", "trialing", "scheduled"],
	});

	const cusProduct = cusProducts.find(
		(cp) => cp.processor?.type === ProcessorType.RevenueCat,
	);

	if (!cusProduct) {
		throw new RecaseError({
			message:
				"Failed to find newly-provisioned RevenueCat customer product after attach",
			code: ErrCode.CusProductNotFound,
			statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
		});
	}

	return { cusProduct, product };
};
