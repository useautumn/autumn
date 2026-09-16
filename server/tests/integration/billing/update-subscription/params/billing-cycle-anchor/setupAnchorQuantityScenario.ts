import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	findActiveCustomerProductById,
	findCustomerProductById,
	type ProductItem,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { CusService } from "@/internal/customers/CusService.js";

export const setupAnchorQuantityScenario = async ({
	customerId,
	quantity = 300,
	prepaidItem = items.prepaidMessages(),
	extraItems = [],
	seats,
	pooled = false,
	extraQuantities = [],
}: {
	customerId: string;
	quantity?: number;
	prepaidItem?: ProductItem;
	extraItems?: ProductItem[];
	seats?: number;
	pooled?: boolean;
	extraQuantities?: { feature_id: string; quantity: number }[];
}) => {
	const plan = products.pro({
		id: `${customerId}-plan`,
		items: [prepaidItem, ...extraItems],
	});
	const licensePlan = products.base({
		id: `${customerId}-seat`,
		group: `${customerId}-seats`,
		items: [items.monthlyPrice({ price: 20 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			...(pooled && seats === undefined
				? [s.entities({ count: 1, featureId: "users" })]
				: []),
			s.products({ list: seats === undefined ? [plan] : [plan, licensePlan] }),
		],
		actions: [
			...(seats === undefined
				? []
				: [
						s.licenses.link({
							parentProductId: plan.id,
							licenseProductId: licensePlan.id,
							included: 0,
						}),
					]),
			s.billing.attach({
				productId: plan.id,
				entityIndex: pooled && seats === undefined ? 0 : undefined,
				options: [{ feature_id: "messages", quantity }, ...extraQuantities],
				...(seats === undefined
					? {}
					: {
							licenseQuantities: [
								{ licenseProductId: licensePlan.id, quantity: seats },
							],
						}),
			}),
			s.advanceTestClock({ days: 14 }),
		],
	});
	const { ctx, autumnV2_4 } = scenario;
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		skipReset: true,
		withEntities: true,
	});
	const entity =
		pooled && seats === undefined ? scenario.entities[0] : undefined;
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: plan.id,
		internalEntityId: entity
			? fullCustomer.entities.find((candidate) => candidate.id === entity.id)
					?.internal_id
			: undefined,
	});
	if (!customerProduct) throw new Error("Expected attached quantity product");
	const subscriptionId = customerProduct.subscription_ids?.[0];
	if (!subscriptionId) throw new Error("Expected attached Stripe subscription");
	const subscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	const readProduct = async () => {
		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			skipReset: true,
			withEntities: true,
		});
		const product = findCustomerProductById({
			fullCustomer: customer,
			customerProductId: customerProduct.id,
		});
		if (!product)
			throw new Error(
				"Expected quantity update to preserve customer-product identity",
			);
		return product;
	};
	const readCustomer = () =>
		autumnV2_4.customers.get<ApiCustomerV5>(customerId);
	const target = {
		customer_id: customerId,
		plan_id: plan.id,
		...(entity ? { entity_id: entity.id } : {}),
	};
	return {
		...scenario,
		advancedTo: Math.floor(scenario.advancedTo / 1000) * 1000,
		plan,
		licensePlan,
		customerProduct,
		subscription,
		readProduct,
		readCustomer,
		target,
	};
};

export const expectAnchorQuantityIdentity = async ({
	scenario,
	anchorMs,
}: {
	scenario: Awaited<ReturnType<typeof setupAnchorQuantityScenario>>;
	anchorMs: number;
}) => {
	const product = await scenario.readProduct();
	expect(product.id).toBe(scenario.customerProduct.id);
	expect(product.subscription_ids).toEqual(
		scenario.customerProduct.subscription_ids,
	);
	const subscription = await scenario.ctx.stripeCli.subscriptions.retrieve(
		scenario.subscription.id,
	);
	expect(subscription.billing_cycle_anchor).toBe(Math.floor(anchorMs / 1000));
	return { product, subscription };
};
