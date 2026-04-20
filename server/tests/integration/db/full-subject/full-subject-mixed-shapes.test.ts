import { describe, expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import {
	getFullSubject,
	getFullSubjectNormalized,
} from "@/internal/customers/repos/getFullSubject/index.js";
import { fullSubjectToComparableSubject } from "./utils/buildComparableFullSubject.js";
import {
	buildBooleanMeteredLooseScenario,
	buildBooleanOnlyScenario,
	buildNoCustomerProductsScenario,
	buildOnlyEntityBoundProductScenario,
	buildProductAndLooseSameFeatureScenario,
} from "./utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "./utils/withInsertedScenario.js";

describe(`${chalk.yellowBright("fullSubject mixed shapes")}`, () => {
	test("product + loose on same feature stays split between product and extra entitlements", async () => {
		const scenario = buildProductAndLooseSameFeatureScenario({
			ctx,
			name: "fullsubject-product-plus-loose",
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
				expect(
					comparable.customer_products[0]?.customer_entitlements,
				).toHaveLength(1);
				expect(comparable.extra_customer_entitlements).toHaveLength(1);
				expect(comparable.extra_customer_entitlements[0]?.id).toBe(
					scenario.customerEntitlements[1]?.id,
				);
			},
		});
	});

	test("boolean + metered + loose combined hydrates correctly", async () => {
		const scenario = buildBooleanMeteredLooseScenario({
			ctx,
			name: "fullsubject-boolean-metered-loose",
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
				expect(
					comparable.customer_products[0]?.customer_entitlements,
				).toHaveLength(2);
				expect(comparable.extra_customer_entitlements).toHaveLength(1);
			},
		});
	});

	test("no customer products yields a stable empty subject shape", async () => {
		const scenario = buildNoCustomerProductsScenario({
			ctx,
			name: "fullsubject-no-products",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				}))!;
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				expect(normalized?.customer_products).toEqual([]);
				expect(normalized?.customer_entitlements).toEqual([]);
				expect(fullSubject?.customer_products).toEqual([]);
				expect(fullSubject?.extra_customer_entitlements).toEqual([]);
			},
		});
	});

	test("boolean-only subject hydrates to flags-backed product entitlements", async () => {
		const scenario = buildBooleanOnlyScenario({
			ctx,
			name: "fullsubject-boolean-only",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				}))!;
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				expect(Object.keys(normalized?.flags ?? {})).toHaveLength(1);
				expect(normalized?.customer_entitlements).toEqual([]);
				expect(
					fullSubject?.customer_products[0]?.customer_entitlements,
				).toHaveLength(1);
			},
		});
	});

	test("only entity-bound products produce empty top-level customer products on customer-scoped subject", async () => {
		const scenario = buildOnlyEntityBoundProductScenario({
			ctx,
			name: "fullsubject-only-entity-bound",
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

				expect(comparable.customer_products).toEqual([]);
				expect(comparable.aggregated_customer_products).toHaveLength(1);
			},
		});
	});
});
