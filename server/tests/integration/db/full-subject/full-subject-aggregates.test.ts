import { describe, expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";
import { fullSubjectToComparableSubject } from "./utils/buildComparableFullSubject.js";
import {
	buildCustomerWithEntityBoundDataScenario,
	buildEntitySubjectScenario,
	buildLooseEntityEntitlementScenario,
} from "./utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "./utils/withInsertedScenario.js";

describe(`${chalk.yellowBright("fullSubject aggregates")}`, () => {
	test("customer-scoped: entity-bound products move to aggregated_customer_products", async () => {
		const scenario = buildCustomerWithEntityBoundDataScenario({
			ctx,
			name: "fullsubject-aggregated-products",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				const comparable = fullSubjectToComparableSubject({
					fullSubject: fullSubject!,
				});

				expect(comparable.customer_products).toHaveLength(1);
				expect(comparable.customer_products[0]?.id).toBe(
					scenario.customerProducts[0]?.id,
				);

				expect(comparable.aggregated_customer_products).toHaveLength(1);
				expect(comparable.aggregated_customer_products[0]?.id).toBe(
					scenario.customerProducts[1]?.id,
				);
			},
		});
	});

	test("customer-scoped: entity-bound entitlements move to aggregated_customer_entitlements", async () => {
		const scenario = buildCustomerWithEntityBoundDataScenario({
			ctx,
			name: "fullsubject-aggregated-entitlements",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				const comparable = fullSubjectToComparableSubject({
					fullSubject: fullSubject!,
				});

				expect(
					comparable.customer_products[0]?.customer_entitlements,
				).toHaveLength(1);
				expect(
					comparable.customer_products[0]?.customer_entitlements[0]?.id,
				).toBe(scenario.customerEntitlements[0]?.id);

				expect(comparable.aggregated_customer_entitlements).toHaveLength(1);
				expect(
					comparable.aggregated_customer_entitlements[0]?.internal_feature_id,
				).toBe(scenario.customerEntitlements[1]?.internal_feature_id);
				expect(comparable.aggregated_customer_entitlements[0]?.balance).toBe(
					scenario.customerEntitlements[1]?.balance,
				);
			},
		});
	});

	test("customer-scoped: aggregated feature balances sum allowance_total and per-entity balance fields", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-aggregated-feature-balance",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				const comparable = fullSubjectToComparableSubject({
					fullSubject: fullSubject!,
				});

				expect(comparable.aggregated_customer_entitlements).toHaveLength(1);
				const aggregate = comparable.aggregated_customer_entitlements[0]!;

				expect(aggregate.allowance_total).toBe(200);
				expect(aggregate.balance).toBe(30);
				expect(aggregate.adjustment).toBe(0);
				expect(aggregate.additional_balance).toBe(0);
				expect(JSON.stringify(aggregate.feature.id)).toBe(
					JSON.stringify(scenario.customerEntitlements[1]!.feature_id),
				);

				expect(aggregate.entities).toMatchObject({
					[scenario.ids.internalEntityIds[0]!]: {
						id: scenario.ids.internalEntityIds[0],
						balance: 20,
						adjustment: 0,
						additional_balance: 0,
					},
					[scenario.ids.internalEntityIds[1]!]: {
						id: scenario.ids.internalEntityIds[1],
						balance: 10,
						adjustment: 0,
						additional_balance: 0,
					},
				});
			},
		});
	});

	test("customer-scoped: entity-scoped loose entitlements are aggregated and excluded from top-level extras", async () => {
		const scenario = buildLooseEntityEntitlementScenario({
			ctx,
			name: "fullsubject-aggregated-loose-entities",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				const comparable = fullSubjectToComparableSubject({
					fullSubject: fullSubject!,
				});

				expect(comparable.extra_customer_entitlements).toHaveLength(1);
				expect(comparable.extra_customer_entitlements[0]?.id).toBe(
					scenario.customerEntitlements[0]?.id,
				);

				expect(comparable.aggregated_customer_entitlements).toHaveLength(1);
				const aggregate = comparable.aggregated_customer_entitlements[0]!;
				expect(aggregate.allowance_total).toBe(200);
				expect(aggregate.balance).toBe(30);
				expect(aggregate.entities).toMatchObject({
					[scenario.ids.internalEntityIds[0]!]: {
						id: scenario.ids.internalEntityIds[0],
						balance: 20,
						adjustment: 0,
						additional_balance: 0,
					},
					[scenario.ids.internalEntityIds[1]!]: {
						id: scenario.ids.internalEntityIds[1],
						balance: 10,
						adjustment: 0,
						additional_balance: 0,
					},
				});
			},
		});
	});
});
