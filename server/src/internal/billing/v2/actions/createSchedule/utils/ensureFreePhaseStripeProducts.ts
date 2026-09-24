import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	cusProductToProduct,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isFreePhasePlaceholderCustomerProduct } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/isFreePhasePlaceholderCustomerProduct";
import { isStripeConnected } from "@/internal/orgs/orgUtils";
import { orgDisableStripeWrites } from "@/internal/orgs/orgUtils/convertOrgUtils";
import { ProductService } from "@/internal/products/ProductService";
import { checkStripeProductExists } from "@/internal/products/productUtils";
import { applyStripeReuseFromVariantFamilies } from "@/internal/products/stripeResourceUtils/applyStripeReuseFromVariantFamilies";

const productsMissingStripeProduct = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): FullProduct[] => {
	const productsByInternalId = new Map<string, FullProduct>();
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		if (!isFreePhasePlaceholderCustomerProduct(customerProduct)) continue;
		if (customerProduct.product.processor?.id) continue;

		productsByInternalId.set(
			customerProduct.product.internal_id,
			cusProductToProduct({ cusProduct: customerProduct }),
		);
	}
	return [...productsByInternalId.values()];
};

/** Reuse an existing Stripe product (possibly created concurrently) before creating one. */
const ensureStripeProduct = async ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}) => {
	const storedProduct = await ProductService.getByInternalId({
		db: ctx.db,
		internalId: product.internal_id,
	});
	if (storedProduct?.processor?.id) {
		product.processor = storedProduct.processor;
		return;
	}

	await checkStripeProductExists({
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		product,
		logger: ctx.logger,
	});
};

/**
 * The only path that gives a free plan a Stripe product: one per plan, created when a
 * schedule first needs a $0 placeholder for it, then reused.
 */
export const ensureFreePhaseStripeProducts = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	if (billingContext.dryRunStripe || billingContext.skipBillingChanges) return;

	const products = productsMissingStripeProduct({ autumnBillingPlan });
	if (products.length === 0) return;

	if (!isStripeConnected({ org: ctx.org, env: ctx.env })) {
		throw new RecaseError({
			message:
				"Connect Stripe to schedule a transition out of a free plan. Autumn uses a $0 Stripe subscription to run the schedule.",
			code: ErrCode.StripeConfigNotFound,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
	if (orgDisableStripeWrites({ ctx })) return;

	await applyStripeReuseFromVariantFamilies({ ctx, products });
	for (const product of products) {
		await ensureStripeProduct({ ctx, product });
	}
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });

	const processorByInternalId = new Map(
		products.map((product) => [product.internal_id, product.processor]),
	);
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		const processor = processorByInternalId.get(
			customerProduct.product.internal_id,
		);
		if (processor) customerProduct.product.processor = processor;
	}
};
