import { customers, products, subscriptions } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { eq, inArray } from "drizzle-orm";
import type { FullSubjectScenario } from "./fullSubjectScenarioBuilders.js";

export const cleanupFullSubjectScenario = async ({
	ctx,
	scenario,
}: {
	ctx: TestContext;
	scenario: FullSubjectScenario;
}) => {
	if (scenario.ids.subscriptionIds.length > 0) {
		await ctx.db
			.delete(subscriptions)
			.where(inArray(subscriptions.id, scenario.ids.subscriptionIds));
	}

	await ctx.db
		.delete(customers)
		.where(eq(customers.internal_id, scenario.ids.internalCustomerId));

	if (scenario.ids.productInternalIds.length > 0) {
		await ctx.db
			.delete(products)
			.where(inArray(products.internal_id, scenario.ids.productInternalIds));
	}
};
