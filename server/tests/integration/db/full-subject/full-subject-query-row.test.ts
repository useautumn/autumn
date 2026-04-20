import { describe, expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { fetchSubjectQueryRow } from "./utils/fetchSubjectQueryRow.js";
import {
	buildCustomerWithEntityBoundDataScenario,
	buildEntitySubjectScenario,
	buildEntitySubjectWithSubscriptionsAndInvoicesScenario,
} from "./utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "./utils/withInsertedScenario.js";

describe(`${chalk.yellowBright("fullSubject raw query row")}`, () => {
	test("customer-scoped row excludes entity-bound products from top-level arrays", async () => {
		const scenario = buildCustomerWithEntityBoundDataScenario({
			ctx,
			name: "fullsubject-row-customer-aggregates",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const row = await fetchSubjectQueryRow({
					ctx,
					customerId: scenario.ids.customerId,
				});

				expect(row).toBeDefined();
				expect(row?.customer_products).toHaveLength(1);
				expect(row?.customer_products[0]?.internal_entity_id).toBeNull();
				expect(
					row?.entity_aggregations?.aggregated_customer_products,
				).toHaveLength(1);
				expect(
					row?.entity_aggregations?.aggregated_customer_products[0]
						?.internal_entity_id,
				).toBe(scenario.ids.internalEntityIds[0]);
			},
		});
	});

	test("entity-scoped row includes parent plus selected entity products", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-row-entity-products",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const row = await fetchSubjectQueryRow({
					ctx,
					customerId: scenario.ids.customerId,
					entityId: scenario.ids.entityIds[0],
				});

				expect(row).toBeDefined();
				expect(row?.customer_products).toHaveLength(2);
				expect(
					row?.customer_products.map((product) => product.internal_entity_id),
				).toEqual([null, scenario.ids.internalEntityIds[0]]);
			},
		});
	});

	test("entity-scoped row omits invoices but still includes subscriptions", async () => {
		const scenario = buildEntitySubjectWithSubscriptionsAndInvoicesScenario({
			ctx,
			name: "fullsubject-row-entity-invoices",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const row = await fetchSubjectQueryRow({
					ctx,
					entityId: scenario.ids.entityIds[0],
				});

				expect(row).toBeDefined();
				expect(row?.invoices).toBeUndefined();
				expect(row?.subscriptions).toHaveLength(1);
			},
		});
	});
});
