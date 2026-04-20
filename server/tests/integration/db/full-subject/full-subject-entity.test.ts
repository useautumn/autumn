import { describe, expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";
import { fullSubjectToComparableSubject } from "./utils/buildComparableFullSubject.js";
import {
	buildEntitySubjectScenario,
	buildEntitySubjectWithSubscriptionsAndInvoicesScenario,
	buildLooseEntityEntitlementScenario,
} from "./utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "./utils/withInsertedScenario.js";

describe(`${chalk.yellowBright("fullSubject entity semantics")}`, () => {
	test("entity subject includes parent and selected entity products only", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-entity-products-only",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubjectWithCustomer = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					entityId: scenario.ids.entityIds[0],
				});
				const fullSubjectEntityOnly = await getFullSubject({
					ctx,
					entityId: scenario.ids.entityIds[0],
				});

				const comparableWithCustomer = fullSubjectToComparableSubject({
					fullSubject: fullSubjectWithCustomer!,
				});
				const comparableEntityOnly = fullSubjectToComparableSubject({
					fullSubject: fullSubjectEntityOnly!,
				});

				expect(
					comparableWithCustomer.customer_products.map((product) => product.id),
				).toEqual(
					comparableEntityOnly.customer_products.map((product) => product.id),
				);

				expect(
					[...comparableWithCustomer.customer_products]
						.map((product) => product.internal_entity_id)
						.sort((left, right) => (left ?? "").localeCompare(right ?? "")),
				).toEqual(
					[null, scenario.ids.internalEntityIds[0]].sort((left, right) =>
						(left ?? "").localeCompare(right ?? ""),
					),
				);
			},
		});
	});

	test("entity subject excludes unrelated entity entitlements", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-entity-entitlement-filter",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubject = await getFullSubject({
					ctx,
					entityId: scenario.ids.entityIds[0],
				});

				const comparable = fullSubjectToComparableSubject({
					fullSubject: fullSubject!,
				});

				const returnedEntitlementIds = comparable.customer_products.flatMap(
					(product) => product.customer_entitlements.map((ent) => ent.id),
				);

				expect(returnedEntitlementIds).toContain(
					scenario.customerEntitlements[0]?.id,
				);
				expect(returnedEntitlementIds).toContain(
					scenario.customerEntitlements[1]?.id,
				);
				expect(returnedEntitlementIds).not.toContain(
					scenario.customerEntitlements[2]?.id,
				);
			},
		});
	});

	test("entity subject omits invoices but still includes subscriptions from selected products", async () => {
		const scenario = buildEntitySubjectWithSubscriptionsAndInvoicesScenario({
			ctx,
			name: "fullsubject-entity-invoice-contract",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					entityId: scenario.ids.entityIds[0],
				});

				const comparable = fullSubjectToComparableSubject({
					fullSubject: fullSubject!,
				});

				expect(comparable.invoices).toEqual([]);
				expect(comparable.subscriptions).toHaveLength(1);
				expect(comparable.subscriptions[0]?.id).toBe(
					scenario.subscriptions[0]?.id,
				);
			},
		});
	});

	test("entity subject includes customer-level loose and selected entity loose, but excludes unrelated entity loose", async () => {
		const scenario = buildLooseEntityEntitlementScenario({
			ctx,
			name: "fullsubject-entity-loose-selection",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					entityId: scenario.ids.entityIds[0],
				});

				const comparable = fullSubjectToComparableSubject({
					fullSubject: fullSubject!,
				});

				const extraIds = comparable.extra_customer_entitlements.map(
					(customerEntitlement) => customerEntitlement.id,
				);

				expect(extraIds).toHaveLength(2);
				expect(new Set(extraIds).size).toBe(2);
				expect(extraIds).toContain(scenario.customerEntitlements[0]?.id);
				expect(extraIds).toContain(scenario.customerEntitlements[1]?.id);
				expect(extraIds).not.toContain(scenario.customerEntitlements[2]?.id);
			},
		});
	});
});
