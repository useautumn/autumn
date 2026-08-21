import type {
	AttachScenario,
	FullCusProduct,
	FullCustomer,
	InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { emitCustomerProductBillingUpdated } from "@/internal/customers/cusProducts/actions/emitCustomerProductBillingUpdated";

/**
 * Fires the products_updated + billing.updated pair lifecycle actions owe on
 * every customer product change, so an action cannot send one and skip the other.
 */
export const dispatchCustomerProductUpdatedWebhooks = async ({
	ctx,
	customerProduct,
	fullCustomer,
	originalFullCustomer,
	scenario,
	updates,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	/** Snapshot taken by the action before it mutated anything. */
	originalFullCustomer: FullCustomer;
	scenario: AttachScenario;
	updates: Partial<InsertCustomerProduct>;
}): Promise<void> => {
	const { org, env } = ctx;

	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario,
		cusProduct: customerProduct,
	});

	emitCustomerProductBillingUpdated({
		ctx,
		originalFullCustomer,
		updateCustomerProducts: [{ customerProduct, updates }],
	});
};
