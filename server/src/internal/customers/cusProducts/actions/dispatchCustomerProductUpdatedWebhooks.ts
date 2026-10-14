import type {
	AttachScenario,
	FullCusProduct,
	FullCustomer,
	InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { emitCustomerProductBillingUpdated } from "@/internal/customers/cusProducts/actions/emitCustomerProductBillingUpdated";

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
