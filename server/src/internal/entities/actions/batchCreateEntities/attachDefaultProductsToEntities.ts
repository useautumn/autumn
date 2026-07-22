import {
	type CustomerData,
	type Entity,
	type FullCustomer,
	isFreeProduct,
	orgDefaultAppliesToEntities,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct";
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
}) => {
	if (!orgDefaultAppliesToEntities({ ctx })) return;

	const defaultProducts = await setupDefaultProductsContext({
		ctx,
		customerData,
		scope: "entity",
	});

	const freeDefaultProducts = defaultProducts.fullProducts.filter((product) =>
		isFreeProduct({ product }),
	);

	const currentEpochMs = Date.now();
	for (const entity of entities) {
		const fullCustomerForEntity = {
			...fullCustomer,
			entity,
		};
		const preparedCustomerProducts = freeDefaultProducts.map((product) => {
			const customerProduct = initFullCustomerProductFromProduct({
				ctx,
				initContext: {
					fullCustomer: fullCustomerForEntity,
					fullProduct: product,
					currentEpochMs,
				},
			});
			return computeAttachPooledBalanceOps({
				customerProduct,
				attachBillingContext: {
					billingStartsAt: currentEpochMs,
					currentEpochMs,
					fullCustomer: fullCustomerForEntity,
					planTiming: "immediate",
					requestedBillingCycleAnchor: undefined,
					skipBillingChanges: true,
				},
				removeCurrentSource: false,
			});
		});

		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: fullCustomer.id ?? fullCustomer.internal_id,
				insertCustomerProducts: preparedCustomerProducts.map(
					({ customerProduct }) => customerProduct,
				),
				pooledBalanceOps: preparedCustomerProducts.flatMap(
					({ pooledBalanceOps }) => pooledBalanceOps,
				),
			},
		});
	}
};
