/** A requested plan leaves a customer product untouched only when it asks for exactly that row. */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	type FullCusProduct,
	type FullProduct,
	type MultiAttachProductContext,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { entities } from "@tests/utils/fixtures/db/entities";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { isUnchangedCustomerProduct } from "@/internal/billing/v2/actions/setPlans/utils/isUnchangedCustomerProduct";

const messagesEntitlement = entitlements.create({
	id: "ent_messages",
	featureId: "messages",
	featureName: "Messages",
	allowance: 100,
});
const ctx = contexts.create({ features: [messagesEntitlement.feature] });
const pro = products.createFull({
	id: "pro",
	prices: [prices.createFixed({ id: "price_pro" })],
});
const proWithMessages = products.createFull({
	id: "pro",
	prices: pro.prices,
	entitlements: [messagesEntitlement],
});
const customMessagesEntitlement = () =>
	customerEntitlements.create({
		entitlementId: messagesEntitlement.id,
		featureId: "messages",
		featureName: "Messages",
		allowance: 100,
		balance: 100,
		customerProductId: "cus_prod_pro",
	});

const proCustomerProduct = (
	overrides: Partial<Parameters<typeof customerProducts.create>[0]> = {},
): FullCusProduct =>
	customerProducts.create({
		id: "cus_prod_pro",
		productId: pro.id,
		product: pro,
		customerPrices: [
			prices.createCustomer({
				price: pro.prices[0]!,
				customerProductId: "cus_prod_pro",
			}),
		],
		...overrides,
	});

const productContext = ({
	fullProduct = pro,
	featureQuantities = [],
	entityId,
}: {
	fullProduct?: FullProduct;
	featureQuantities?: MultiAttachProductContext["featureQuantities"];
	entityId?: string;
} = {}): MultiAttachProductContext => {
	const { fullCustomer } = contexts.createBilling({});
	return {
		fullProduct,
		customPrices: [],
		customEnts: [],
		featureQuantities,
		fullCustomer: {
			...fullCustomer,
			entity: entityId
				? entities.create({ id: entityId, featureId: "users" })
				: undefined,
		},
	};
};

const isUnchanged = ({
	customerProduct,
	productContext,
}: {
	customerProduct: FullCusProduct;
	productContext: MultiAttachProductContext;
}) =>
	isUnchangedCustomerProduct({
		ctx,
		customerProduct,
		productContext,
		internalEntityId: productContext.fullCustomer.entity?.internal_id,
	});

describe(chalk.yellowBright("isUnchangedCustomerProduct"), () => {
	test("the same plan, scope and quantities is unchanged", () => {
		expect(
			isUnchanged({
				customerProduct: proCustomerProduct(),
				productContext: productContext(),
			}),
		).toBe(true);
	});

	test("another version of the plan is a change", () => {
		const proV2 = { ...pro, internal_id: "internal_pro_v2", version: 2 };

		expect(
			isUnchanged({
				customerProduct: proCustomerProduct(),
				productContext: productContext({ fullProduct: proV2 }),
			}),
		).toBe(false);
	});

	test("the plan on another entity is a change", () => {
		expect(
			isUnchanged({
				customerProduct: proCustomerProduct(),
				productContext: productContext({ entityId: "seat_1" }),
			}),
		).toBe(false);
	});

	test("different prices are a change", () => {
		const [proPrice] = pro.prices;
		const repriced = products.createFull({
			id: "pro",
			prices: [
				{
					...proPrice!,
					config: { ...proPrice!.config, interval: BillingInterval.Year },
				},
			],
		});

		expect(
			isUnchanged({
				customerProduct: proCustomerProduct(),
				productContext: productContext({ fullProduct: repriced }),
			}),
		).toBe(false);
	});

	test("a different prepaid quantity is a change", () => {
		expect(
			isUnchanged({
				customerProduct: proCustomerProduct({
					options: [{ feature_id: "messages", quantity: 200 }],
				}),
				productContext: productContext({
					featureQuantities: [{ feature_id: "messages", quantity: 300 }],
				}),
			}),
		).toBe(false);
	});

	test("an extra feature-only item on the requested plan is a change", () => {
		expect(
			isUnchanged({
				customerProduct: proCustomerProduct(),
				productContext: productContext({ fullProduct: proWithMessages }),
			}),
		).toBe(false);
	});

	test("a customized feature-only item requested back to the base plan is a change", () => {
		expect(
			isUnchanged({
				customerProduct: proCustomerProduct({
					customerEntitlements: [customMessagesEntitlement()],
				}),
				productContext: productContext(),
			}),
		).toBe(false);
	});

	test("the same plan with the same feature-only item is unchanged", () => {
		expect(
			isUnchanged({
				customerProduct: proCustomerProduct({
					product: proWithMessages,
					customerEntitlements: [customMessagesEntitlement()],
				}),
				productContext: productContext({ fullProduct: proWithMessages }),
			}),
		).toBe(true);
	});
});
