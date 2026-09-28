import {
	type CustomerData,
	type Entity,
	type FullCustomer,
	isFreeProduct,
	orgDefaultAppliesToEntities,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";
import { setupDefaultProductsContext } from "@/internal/customers/actions/createWithDefaults/setup/setupDefaultProductsContext";

export const attachDefaultProductsToEntities = async ({
	ctx,
	fullCustomer,
	entities,
	customerData,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	entities: Entity[];
	customerData?: CustomerData;
}): Promise<FullCustomer> => {
	if (!orgDefaultAppliesToEntities({ ctx })) return fullCustomer;

	const defaultProducts = await setupDefaultProductsContext({
		ctx,
		customerData,
		scope: "entity",
	});

	const freeDefaultProducts = defaultProducts.fullProducts.filter((product) =>
		isFreeProduct({ product }),
	);

	const currentEpochMs = Date.now();
	let customerProducts = fullCustomer.customer_products;
	let pooledFullCustomer = fullCustomer;
	for (const entity of entities) {
		const entityFullCustomer = {
			...fullCustomer,
			customer_products: [...customerProducts],
			entity,
		};
		const insertCustomerProducts = freeDefaultProducts.map((product) =>
			initFullCustomerProductFromProduct({
				ctx,
				initContext: {
					fullCustomer: entityFullCustomer,
					fullProduct: product,
					currentEpochMs,
				},
			}),
		);
		const autumnBillingPlan = {
			customerId: fullCustomer.id ?? "",
			insertCustomerProducts,
		};

		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan,
		});

		customerProducts = [...customerProducts, ...insertCustomerProducts];
		// Each entity is saved, pooled and announced before the next one starts.
		pooledFullCustomer = await applyPooledBalanceCustomerProductTransitions({
			ctx,
			fullCustomer: { ...fullCustomer, customer_products: customerProducts },
			outgoingCustomerProducts: [],
			incomingCustomerProducts: insertCustomerProducts,
			now: currentEpochMs,
		});

		await billingPlanToSendProductsUpdated({
			ctx,
			autumnBillingPlan,
			billingContext: { fullCustomer: entityFullCustomer },
		});

		void sendBillingUpdatedWebhook({
			ctx,
			autumnBillingPlan,
			originalFullCustomer: entityFullCustomer,
		});
	}

	return pooledFullCustomer;
};
