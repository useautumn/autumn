import { describe, expect, test } from "bun:test";
import { CustomerExpand, normalizedToFullSubject } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	getFullSubject,
	getFullSubjectNormalized,
} from "@/internal/customers/repos/getFullSubject/index.js";
import {
	fullCustomerToComparableSubject,
	fullSubjectToComparableSubject,
} from "./utils/buildComparableFullSubject.js";
import {
	buildCustomerLooseEntitlementScenario,
	buildCustomerMeteredScenario,
	buildCustomerMixedBooleanMeteredScenario,
	buildCustomerWithEntityBoundDataScenario,
	buildCustomerWithInvoicesAndSubscriptionsScenario,
	buildEntitySubjectScenario,
	buildRolloverScenario,
} from "./utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "./utils/withInsertedScenario.js";

const pickParityFields = ({
	comparable,
}: {
	comparable: ReturnType<typeof fullSubjectToComparableSubject>;
}) => ({
	customer_products: comparable.customer_products,
	extra_customer_entitlements: comparable.extra_customer_entitlements,
	subscriptions: comparable.subscriptions,
	invoices: comparable.invoices,
});

describe(`${chalk.yellowBright("fullSubject db parity")}`, () => {
	test("customer-scoped parity: basic metered product", async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "fullsubject-basic-metered",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullCustomer = await CusService.getFull({
					ctx,
					idOrInternalId: scenario.ids.customerId,
				});
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});
				const normalized = await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				});

				expect(fullSubject).toBeDefined();
				expect(normalized).toBeDefined();

				const hydrated = normalizedToFullSubject({
					normalized: normalized!,
				});

				expect(
					pickParityFields({
						comparable: fullSubjectToComparableSubject({
							fullSubject: fullSubject!,
						}),
					}),
				).toEqual(
					fullCustomerToComparableSubject({
						fullCustomer,
					}),
				);

				expect(
					fullSubjectToComparableSubject({
						fullSubject: fullSubject!,
					}),
				).toEqual(
					fullSubjectToComparableSubject({
						fullSubject: hydrated,
					}),
				);
			},
		});
	});

	test("customer-scoped parity: mixed boolean and metered", async () => {
		const scenario = buildCustomerMixedBooleanMeteredScenario({
			ctx,
			name: "fullsubject-mixed-bool-metered",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullCustomer = await CusService.getFull({
					ctx,
					idOrInternalId: scenario.ids.customerId,
				});
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				expect(
					pickParityFields({
						comparable: fullSubjectToComparableSubject({
							fullSubject: fullSubject!,
						}),
					}),
				).toEqual(
					fullCustomerToComparableSubject({
						fullCustomer,
					}),
				);
			},
		});
	});

	test("customer-scoped parity: loose entitlement", async () => {
		const scenario = buildCustomerLooseEntitlementScenario({
			ctx,
			name: "fullsubject-loose",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullCustomer = await CusService.getFull({
					ctx,
					idOrInternalId: scenario.ids.customerId,
				});
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				expect(
					pickParityFields({
						comparable: fullSubjectToComparableSubject({
							fullSubject: fullSubject!,
						}),
					}),
				).toEqual(
					fullCustomerToComparableSubject({
						fullCustomer,
					}),
				);
			},
		});
	});

	test("customer-scoped parity: subscriptions and invoices", async () => {
		const scenario = buildCustomerWithInvoicesAndSubscriptionsScenario({
			ctx,
			name: "fullsubject-subs-invoices",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullCustomer = await CusService.getFull({
					ctx,
					idOrInternalId: scenario.ids.customerId,
					withSubs: true,
					expand: [CustomerExpand.Invoices],
				});
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				expect(
					pickParityFields({
						comparable: fullSubjectToComparableSubject({
							fullSubject: fullSubject!,
						}),
					}),
				).toEqual(
					fullCustomerToComparableSubject({
						fullCustomer,
					}),
				);
			},
		});
	});

	test("customer-scoped: entity-bound data lives in aggregated fields", async () => {
		const scenario = buildCustomerWithEntityBoundDataScenario({
			ctx,
			name: "fullsubject-aggregated-entity-data",
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
				expect(comparable.customer_products[0]?.internal_entity_id).toBeNull();

				expect(comparable.aggregated_customer_products).toHaveLength(1);
				expect(
					comparable.aggregated_customer_products[0]?.internal_entity_id,
				).toBe(scenario.ids.internalEntityIds[0]);

				expect(comparable.aggregated_customer_entitlements).toHaveLength(1);
				expect(
					JSON.stringify(
						comparable.aggregated_customer_entitlements[0]?.feature_id ?? null,
					),
				).toBe(
					JSON.stringify(scenario.customerEntitlements[1]!.feature_id ?? null),
				);
			},
		});
	});

	test("entity-scoped query semantics: parent and selected entity products only", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-entity-query",
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

				expect(comparableWithCustomer.customer_products).toHaveLength(2);
				expect(
					[...comparableWithCustomer.customer_products]
						.map((product) => product.internal_entity_id)
						.sort((left, right) => (left ?? "").localeCompare(right ?? "")),
				).toEqual(
					[null, scenario.ids.internalEntityIds[0]].sort((left, right) =>
						(left ?? "").localeCompare(right ?? ""),
					),
				);

				expect(
					comparableWithCustomer.customer_products.some(
						(product) =>
							product.internal_entity_id === scenario.ids.internalEntityIds[1],
					),
				).toBe(false);

				expect(comparableWithCustomer.invoices).toEqual([]);
			},
		});
	});

	test("customer-scoped parity: rollovers are preserved with deterministic order", async () => {
		const scenario = buildRolloverScenario({
			ctx,
			name: "fullsubject-rollovers",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullCustomer = await CusService.getFull({
					ctx,
					idOrInternalId: scenario.ids.customerId,
				});
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				expect(
					pickParityFields({
						comparable: fullSubjectToComparableSubject({
							fullSubject: fullSubject!,
						}),
					}),
				).toEqual(
					fullCustomerToComparableSubject({
						fullCustomer,
					}),
				);
			},
		});
	});
});
