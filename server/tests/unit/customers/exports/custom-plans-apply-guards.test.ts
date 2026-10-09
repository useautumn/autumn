import { describe, expect, test } from "bun:test";
import {
	CustomerExportKind,
	type FullCusProduct,
	Scopes,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerProductIsCustomResult } from "@/internal/customers/cusProducts/actions/deriveIsCustom/types/customerProductIsCustomResult.js";
import { isApplicableFlip } from "@/internal/customers/exports/customPlans/applyIsCustomFlips.js";
import { assertCanApplyCustomPlans } from "@/internal/customers/exports/customPlans/assertCanApplyCustomPlans.js";

const flagged = (isCustom: boolean) =>
	({ id: "cus_prod_1", is_custom: isCustom }) as FullCusProduct;

describe("isApplicableFlip", () => {
	test.each([
		{
			name: "a definitive result that moves the flag → written",
			stored: true,
			result: { isCustom: false, reason: "matches_catalog" },
			applicable: true,
		},
		{
			name: "a customized result that moves the flag → written",
			stored: false,
			result: { isCustom: true, reason: "customized", diff: {} },
			applicable: true,
		},
		{
			name: "a result matching the stored flag → nothing to write",
			stored: false,
			result: { isCustom: false, reason: "matches_catalog" },
			applicable: false,
		},
		{
			name: "a missing catalog version → never written",
			stored: false,
			result: { isCustom: true, reason: "catalog_missing" },
			applicable: false,
		},
		{
			name: "a failed comparison → never written",
			stored: false,
			result: { isCustom: true, reason: "comparison_failed" },
			applicable: false,
		},
	] as {
		name: string;
		stored: boolean;
		result: CustomerProductIsCustomResult;
		applicable: boolean;
	}[])("$name", ({ stored, result, applicable }) => {
		expect(isApplicableFlip({ customerProduct: flagged(stored), result })).toBe(
			applicable,
		);
	});
});

describe("assertCanApplyCustomPlans", () => {
	const ctxWith = (scopes: string[]) =>
		({ scopes }) as unknown as AutumnContext;
	const params = (apply: boolean) => ({
		kind: CustomerExportKind.CustomPlans,
		search: "",
		filters: {},
		apply,
	});

	test("read-only scopes can run a dry run", () => {
		expect(() =>
			assertCanApplyCustomPlans({
				ctx: ctxWith([Scopes.Customers.Read]),
				params: params(false),
			}),
		).not.toThrow();
	});

	test("read-only scopes cannot apply", () => {
		expect(() =>
			assertCanApplyCustomPlans({
				ctx: ctxWith([Scopes.Customers.Read]),
				params: params(true),
			}),
		).toThrow(/Insufficient scopes/);
	});

	test("write scope can apply", () => {
		expect(() =>
			assertCanApplyCustomPlans({
				ctx: ctxWith([Scopes.Customers.Read, Scopes.Customers.Write]),
				params: params(true),
			}),
		).not.toThrow();
	});

	test("unscoped auth passes, as it does on every route", () => {
		expect(() =>
			assertCanApplyCustomPlans({ ctx: ctxWith([]), params: params(true) }),
		).not.toThrow();
	});
});
