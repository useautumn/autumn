import { describe, expect, test } from "bun:test";
import { resolveOperationScope } from "@/internal/migrations/v2/batchOperations/scope/resolveOperationScope.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";

const INTERNAL_PRODUCT_ID = "prod_internal_1";

const migrationWithPlanFilter = (
	plan: Record<string, unknown> | undefined,
): MigrationRuntime => ({
	id: "mig_test",
	filter: plan === undefined ? null : { customer: { plan } },
});

const resolve = ({
	opFilters = [{}],
	migrationFilter,
}: {
	opFilters?: Record<string, unknown>[];
	migrationFilter?: Record<string, unknown>;
}) =>
	resolveOperationScope({
		migration: migrationWithPlanFilter(migrationFilter),
		planFilters: opFilters.map((filter) => ({ plan_id: "pro", ...filter })),
		internalProductId: INTERNAL_PRODUCT_ID,
	});

describe("resolveOperationScope", () => {
	test("omitted everywhere → unconstrained scope", () => {
		expect(resolve({})).toEqual({
			scope: {
				internalProductId: INTERNAL_PRODUCT_ID,
				isCustom: null,
				isPaid: null,
				isRecurring: null,
				hasBasePrice: null,
			},
		});
	});

	test("boolean fields lower from scalars and provable { $eq }", () => {
		expect(resolve({ opFilters: [{ custom: false }] }).scope?.isCustom).toBe(
			false,
		);
		expect(resolve({ opFilters: [{ paid: true }] }).scope?.isPaid).toBe(true);
		expect(
			resolve({ opFilters: [{ recurring: { $eq: false } }] }).scope
				?.isRecurring,
		).toBe(false);
		expect(resolve({ migrationFilter: { custom: true } }).scope?.isCustom).toBe(
			true,
		);
	});

	test("price lowers from null-existence forms", () => {
		expect(resolve({ opFilters: [{ price: null }] }).scope?.hasBasePrice).toBe(
			false,
		);
		expect(
			resolve({ opFilters: [{ price: { $eq: null } }] }).scope?.hasBasePrice,
		).toBe(false);
		expect(
			resolve({ opFilters: [{ price: { $ne: null } }] }).scope?.hasBasePrice,
		).toBe(true);
		expect(resolve({ opFilters: [{ price: {} }] }).unsupportedField).toBe(
			"price",
		);
	});

	test("conjuncts and levels reconcile: agree keeps the value, disagree is unsupported", () => {
		expect(
			resolve({
				opFilters: [{ custom: true }, {}],
				migrationFilter: { custom: true },
			}).scope?.isCustom,
		).toBe(true);
		expect(
			resolve({
				opFilters: [{ custom: true }],
				migrationFilter: { custom: false },
			}).unsupportedField,
		).toBe("custom");
		expect(
			resolve({ opFilters: [{ custom: true }, { custom: false }] })
				.unsupportedField,
		).toBe("custom");
	});

	test("unprovable matcher forms are unsupported", () => {
		expect(
			resolve({ opFilters: [{ custom: { $ne: true } }] }).unsupportedField,
		).toBe("custom");
		expect(
			resolve({ opFilters: [{ paid: { $eq: "yes" } }] }).unsupportedField,
		).toBe("paid");
	});

	test("row-decidable fields inside the migration filter's $or are unsupported", () => {
		expect(
			resolve({
				migrationFilter: { $or: [{ plan_id: "a" }, { paid: true }] },
			}).unsupportedField,
		).toBe("paid");
	});

	test("a $some-navigated migration plan filter contributes nothing", () => {
		const result = resolveOperationScope({
			migration: migrationWithPlanFilter({ $some: { custom: true } }),
			planFilters: [{ plan_id: "pro" }],
			internalProductId: INTERNAL_PRODUCT_ID,
		});
		expect(result.scope?.isCustom).toBeNull();
	});
});
