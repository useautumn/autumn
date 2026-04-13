import {
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers,
	entities,
	entitlements,
	invoices,
	prices,
	products,
	rollovers,
	subscriptions,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import type { FullSubjectScenario } from "./fullSubjectScenarioBuilders.js";

export const insertFullSubjectScenario = async ({
	ctx,
	scenario,
}: {
	ctx: TestContext;
	scenario: FullSubjectScenario;
}) => {
	if (scenario.customer) {
		await ctx.db.insert(customers).values(scenario.customer);
	}

	if (scenario.entities.length > 0) {
		await ctx.db.insert(entities).values(scenario.entities);
	}

	if (scenario.products.length > 0) {
		await ctx.db.insert(products).values(scenario.products);
	}

	if (scenario.entitlements.length > 0) {
		await ctx.db.insert(entitlements).values(scenario.entitlements);
	}

	if (scenario.prices.length > 0) {
		await ctx.db.insert(prices).values(scenario.prices);
	}

	if (scenario.subscriptions.length > 0) {
		await ctx.db.insert(subscriptions).values(scenario.subscriptions);
	}

	if (scenario.customerProducts.length > 0) {
		await ctx.db.insert(customerProducts).values(scenario.customerProducts);
	}

	if (scenario.customerPrices.length > 0) {
		await ctx.db.insert(customerPrices).values(scenario.customerPrices);
	}

	if (scenario.customerEntitlements.length > 0) {
		await ctx.db
			.insert(customerEntitlements)
			.values(scenario.customerEntitlements);
	}

	if (scenario.rollovers.length > 0) {
		await ctx.db.insert(rollovers).values(scenario.rollovers);
	}

	if (scenario.invoices.length > 0) {
		await ctx.db.insert(invoices).values(scenario.invoices);
	}

	return scenario.ids;
};
