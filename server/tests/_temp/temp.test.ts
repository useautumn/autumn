import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { sql } from "drizzle-orm";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService";
import { getFullCusQuery } from "@/internal/customers/getFullCusQuery";

const getPlanText = ({ rows }: { rows: Record<string, unknown>[] }) => {
	return rows
		.map((row) => {
			const queryPlan = row["QUERY PLAN"];

			if (typeof queryPlan === "string") {
				return queryPlan;
			}

			const firstValue = Object.values(row)[0];
			return typeof firstValue === "string"
				? firstValue
				: JSON.stringify(firstValue);
		})
		.join("\n");
};

test("temp: EXPLAIN ANALYZE getFullCusQuery", async () => {
	const customerId = `temp-explain-full-cus-${Date.now()}`;
	const explainPlanId = "explain-plan";

	const product = products.proWithTrial({
		id: explainPlanId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
	});

	const { ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: product.id }),
			s.track({ featureId: TestFeature.Messages, value: 1 }),
		],
	});

	const entityId = entities[0]?.id;
	if (!entityId) {
		throw new Error("Expected scenario to create an entity");
	}

	const fullCustomerQuery = getFullCusQuery(
		customerId,
		ctx.org.id,
		ctx.env,
		RELEVANT_STATUSES,
		true,
		true,
		true,
		true,
		false,
		entityId,
	);

	const explainQuery = sql`
		EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
		${fullCustomerQuery}
	`;

	const explainRows = (await ctx.db.execute(explainQuery)) as Record<
		string,
		unknown
	>[];
	const planText = getPlanText({ rows: explainRows });

	console.log("\n=== getFullCusQuery EXPLAIN ANALYZE ===\n");
	console.log(planText);
	console.log("\n=== /getFullCusQuery EXPLAIN ANALYZE ===\n");

	expect(explainRows.length).toBeGreaterThan(0);
	expect(planText).toContain("Execution Time");
});
