import {
	AttachScenario,
	CusProductStatus,
	type CustomerProductUpdates,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import {
	type BillingChangeCollector,
	createBillingChangeCollector,
	trackCustomerProductInsertion,
	trackCustomerProductUpdate,
} from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/billingChangeCollector";
import { flushBillingUpdated } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/emitBillingUpdated";
import { activateFreeSuccessorProduct } from "@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct";

/**
 * Expires a customer product, then activates its free successor (scheduled or
 * default) when nothing else in its group is live. Callers mid-workflow pass a
 * `collector` and flush once at the end; standalone callers emit here.
 */
export const expireCustomerProductAndActivateDefault = async ({
	ctx,
	customerProduct,
	fullCustomer,
	updates: extraUpdates,
	collector,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates?: CustomerProductUpdates;
	collector?: BillingChangeCollector;
}): Promise<{
	updates: CustomerProductUpdates;
	expiredCustomerProduct: FullCusProduct;
	activatedCustomerProduct?: FullCusProduct;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const { org, env } = ctx;

	// Constructed up here because that is what snapshots the pre-change customer
	// the emitted diff is built against.
	const ownsEmission = !collector;
	const billingChanges =
		collector ?? createBillingChangeCollector({ fullCustomer });

	// 1. Expire the product
	const updates: CustomerProductUpdates = {
		status: CusProductStatus.Expired,
		...extraUpdates,
	};

	// Executing through the shared plan runs the license lifecycle when the
	// expiring product carried license state.
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: fullCustomer.id || fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [{ customerProduct, updates }],
		},
	});

	ctx.logger.debug(
		`[expireCustomerProduct]: expiring ${customerProduct.product.name}`,
	);

	// Tracking applies the update to `fullCustomer` in place, so successor
	// activation below already sees the expired status.
	const expiredCustomerProduct = trackCustomerProductUpdate({
		collector: billingChanges,
		customerProduct,
		updates,
	});

	// 2. Send products_updated (Expired) — must be enqueued before successor
	// activation, which enqueues its own products_updated (New).
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Expired,
		cusProduct: customerProduct,
	});

	// 3. Activate free successor (scheduled or default)
	const { activatedCustomerProduct, insertedCustomerProduct } =
		await activateFreeSuccessorProduct({
			ctx,
			fromCustomerProduct: customerProduct,
			fullCustomer,
		});

	// 4. Record the successor transition, which plan-change collapsing pairs with
	// the expiry tracked above.
	if (activatedCustomerProduct) {
		trackCustomerProductUpdate({
			collector: billingChanges,
			customerProduct: activatedCustomerProduct,
			updates: { status: CusProductStatus.Active },
		});
	}

	if (insertedCustomerProduct) {
		trackCustomerProductInsertion({
			collector: billingChanges,
			customerProduct: insertedCustomerProduct,
		});
	}

	// Mid-workflow callers pass a collector and flush once at the end.
	if (ownsEmission) flushBillingUpdated({ ctx, collector: billingChanges });

	return {
		updates,
		expiredCustomerProduct,
		activatedCustomerProduct,
		insertedCustomerProduct,
	};
};
