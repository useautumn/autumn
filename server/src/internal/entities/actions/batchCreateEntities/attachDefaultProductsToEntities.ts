import {
	type AutumnBillingPlan,
	type CustomerData,
	type Entity,
	type FullCustomer,
	isFreeProduct,
	orgDefaultAppliesToEntities,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct";
import { setupDefaultProductsContext } from "@/internal/customers/actions/createWithDefaults/setup/setupDefaultProductsContext";

export const buildEntityDefaultProductsPlans = async ({
	ctx,
	fullCustomer,
	entities,
	customerData,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	entities: Entity[];
	customerData?: CustomerData;
}) => {
	if (!orgDefaultAppliesToEntities({ ctx })) return [];

	const defaultProducts = await setupDefaultProductsContext({
		ctx,
		customerData,
		scope: "entity",
	});

	const freeDefaultProducts = defaultProducts.fullProducts.filter((product) =>
		isFreeProduct({ product }),
	);

	const currentEpochMs = Date.now();
	return entities.map((entity) => {
		const insertCustomerProducts = freeDefaultProducts.map((product) =>
			initFullCustomerProductFromProduct({
				ctx,
				initContext: {
					fullCustomer: {
						...fullCustomer,
						entity: entity,
					},
					fullProduct: product,
					currentEpochMs,
				},
			}),
		);

		return {
			customerId: fullCustomer.id ?? "",
			insertCustomerProducts,
		} satisfies AutumnBillingPlan;
	});
};

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
}) => {
	const autumnBillingPlans = await buildEntityDefaultProductsPlans({
		ctx,
		fullCustomer,
		entities,
		customerData,
	});

	for (const autumnBillingPlan of autumnBillingPlans) {
		await executeAutumnBillingPlan({ ctx, autumnBillingPlan });
	}
};
