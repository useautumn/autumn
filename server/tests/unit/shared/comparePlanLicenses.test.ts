/**
 * License equality — every field, every falsey/default pair.
 *
 * Overlay content (`licenseCustomizesAreSame`):
 *   undefined / null / {} are empty. `{ price: null }` is not empty.
 *   add_items/remove_items omitted === []. interval_count unset === 1.
 *
 * Link (`planLicensesAreSame`):
 *   included / prepaid_only are required — 0 and false are real values.
 *   version and expanded plan are ignored.
 *
 * Patch (`customizePlanLicensesAreSame`):
 *   omitted included !== 0. omitted prepaid_only !== false.
 *   customize null is "clear"; omitted / {} are "no overlay payload".
 *   metadata omitted / null / {} are empty.
 */

import { describe, expect, test } from "bun:test";
import {
	type ApiPlanLicenseV1,
	AppEnv,
	BillingInterval,
	type CustomizePlanLicense,
	type LicenseCustomize,
	ResetInterval,
} from "@autumn/shared";
import {
	customizePlanLicensesAreSame,
	hasLicenseCustomize,
	licenseCustomizePatchesAreSame,
	licenseCustomizesAreSame,
	planLicensesAreSame,
	removePlanLicensesAreSame,
} from "@autumn/shared/utils/planV1Utils/diff/comparePlanLicenses.js";

const month = BillingInterval.Month;

const monthPrice = ({
	amount,
	intervalCount,
}: {
	amount: number;
	intervalCount?: number;
}) => ({
	amount,
	interval: month,
	...(intervalCount !== undefined ? { interval_count: intervalCount } : {}),
});

const messagesItem = (overrides: Record<string, unknown> = {}) => ({
	feature_id: "messages",
	...overrides,
});

const overlaySame = (
	left?: LicenseCustomize | null,
	right?: LicenseCustomize | null,
	expected = true,
) => {
	expect(licenseCustomizesAreSame({ left, right })).toBe(expected);
	expect(licenseCustomizesAreSame({ left: right, right: left })).toBe(expected);
};

const patchSame = (
	left: CustomizePlanLicense,
	right: CustomizePlanLicense,
	expected = true,
) => {
	expect(customizePlanLicensesAreSame({ left, right })).toBe(expected);
	expect(customizePlanLicensesAreSame({ left: right, right: left })).toBe(
		expected,
	);
};

const link = (
	overrides: Omit<Partial<ApiPlanLicenseV1>, "customize"> & {
		license_plan_id?: string;
		customize?: ApiPlanLicenseV1["customize"] | null;
	} = {},
): ApiPlanLicenseV1 =>
	({
		license_plan_id: "seat",
		version: 1,
		included: 2,
		prepaid_only: true,
		...overrides,
	}) as ApiPlanLicenseV1;

const linkSame = (
	left: ApiPlanLicenseV1,
	right: ApiPlanLicenseV1,
	expected = true,
) => {
	expect(planLicensesAreSame({ left, right })).toBe(expected);
	expect(planLicensesAreSame({ left: right, right: left })).toBe(expected);
};

describe("hasLicenseCustomize", () => {
	test("undefined / null / {} are empty", () => {
		expect(hasLicenseCustomize(undefined)).toBe(false);
		expect(hasLicenseCustomize(null)).toBe(false);
		expect(hasLicenseCustomize({})).toBe(false);
	});

	test("price / add_items / remove_items each count, including price: null", () => {
		expect(hasLicenseCustomize({ price: null })).toBe(true);
		expect(hasLicenseCustomize({ price: monthPrice({ amount: 20 }) })).toBe(
			true,
		);
		expect(hasLicenseCustomize({ add_items: [] })).toBe(true);
		expect(hasLicenseCustomize({ remove_items: [] })).toBe(true);
	});
});

describe("licenseCustomizesAreSame — empty overlay", () => {
	const empties: { label: string; value?: LicenseCustomize | null }[] = [
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "{}", value: {} },
	];

	for (const left of empties) {
		for (const right of empties) {
			test(`${left.label} vs ${right.label}`, () => {
				overlaySame(left.value, right.value, true);
			});
		}
	}

	test("{ price: null } is not empty", () => {
		overlaySame({ price: null }, {}, false);
		overlaySame({ price: null }, undefined, false);
		overlaySame({ price: null }, null, false);
		overlaySame({ price: null }, { price: null }, true);
	});
});

describe("licenseCustomizesAreSame — price", () => {
	test("omitted vs omitted", () => {
		overlaySame({}, { add_items: [] }, true);
	});

	test("same amount + interval; interval_count unset === 1", () => {
		overlaySame(
			{ price: monthPrice({ amount: 20 }) },
			{ price: monthPrice({ amount: 20, intervalCount: 1 }) },
			true,
		);
	});

	test("interval_count 1 vs 2", () => {
		overlaySame(
			{ price: monthPrice({ amount: 20, intervalCount: 1 }) },
			{ price: monthPrice({ amount: 20, intervalCount: 2 }) },
			false,
		);
	});

	test("amount 0 is kept (not treated as omitted)", () => {
		overlaySame(
			{ price: monthPrice({ amount: 0 }) },
			{ price: monthPrice({ amount: 20 }) },
			false,
		);
		overlaySame(
			{ price: monthPrice({ amount: 0 }) },
			{ price: monthPrice({ amount: 0 }) },
			true,
		);
	});

	test("different interval", () => {
		overlaySame(
			{ price: { amount: 20, interval: BillingInterval.Month } },
			{ price: { amount: 20, interval: BillingInterval.Year } },
			false,
		);
	});

	test("set price vs omitted / null", () => {
		overlaySame({ price: monthPrice({ amount: 20 }) }, {}, false);
		overlaySame({ price: monthPrice({ amount: 20 }) }, { price: null }, false);
	});

	test("shared-currency amount mismatch differs; extra currency does not", () => {
		overlaySame(
			{
				price: {
					amount: 20,
					interval: month,
					additional_currencies: [{ currency: "eur", amount: 18 }],
				},
			},
			{
				price: {
					amount: 20,
					interval: month,
					additional_currencies: [{ currency: "eur", amount: 19 }],
				},
			},
			false,
		);
		overlaySame(
			{
				price: {
					amount: 20,
					interval: month,
					additional_currencies: [{ currency: "eur", amount: 18 }],
				},
			},
			{ price: { amount: 20, interval: month } },
			true,
		);
	});
});

describe("licenseCustomizesAreSame — add_items", () => {
	test("omitted vs [] vs undefined", () => {
		overlaySame({}, { add_items: [] }, true);
		overlaySame({ add_items: undefined }, { add_items: [] }, true);
	});

	test("order does not matter", () => {
		overlaySame(
			{ add_items: [messagesItem(), { feature_id: "words" }] },
			{ add_items: [{ feature_id: "words" }, messagesItem()] },
			true,
		);
	});

	test("duplicate is not one", () => {
		overlaySame(
			{ add_items: [messagesItem(), messagesItem()] },
			{ add_items: [messagesItem()] },
			false,
		);
	});

	test("item defaults collapse: included 0 / unlimited false / pooled false", () => {
		overlaySame(
			{ add_items: [messagesItem()] },
			{
				add_items: [
					messagesItem({ included: 0, unlimited: false, pooled: false }),
				],
			},
			true,
		);
	});

	test("included 0 vs 100", () => {
		overlaySame(
			{ add_items: [messagesItem({ included: 0 })] },
			{ add_items: [messagesItem({ included: 100 })] },
			false,
		);
	});

	test("different feature_id", () => {
		overlaySame(
			{ add_items: [messagesItem()] },
			{ add_items: [{ feature_id: "words" }] },
			false,
		);
	});

	test("reset.interval_count unset === 1", () => {
		overlaySame(
			{
				add_items: [
					messagesItem({ reset: { interval: ResetInterval.Month } }),
				],
			},
			{
				add_items: [
					messagesItem({
						reset: { interval: ResetInterval.Month, interval_count: 1 },
					}),
				],
			},
			true,
		);
	});
});

describe("licenseCustomizesAreSame — remove_items", () => {
	test("omitted vs []", () => {
		overlaySame({}, { remove_items: [] }, true);
	});

	test("order does not matter", () => {
		overlaySame(
			{
				remove_items: [
					{ feature_id: "messages" },
					{ feature_id: "words" },
				],
			},
			{
				remove_items: [
					{ feature_id: "words" },
					{ feature_id: "messages" },
				],
			},
			true,
		);
	});

	test("interval set: interval_count unset === 1", () => {
		overlaySame(
			{
				remove_items: [
					{ feature_id: "messages", interval: ResetInterval.Month },
				],
			},
			{
				remove_items: [
					{
						feature_id: "messages",
						interval: ResetInterval.Month,
						interval_count: 1,
					},
				],
			},
			true,
		);
	});

	test("interval_count 1 vs 2", () => {
		overlaySame(
			{
				remove_items: [
					{
						feature_id: "messages",
						interval: ResetInterval.Month,
						interval_count: 1,
					},
				],
			},
			{
				remove_items: [
					{
						feature_id: "messages",
						interval: ResetInterval.Month,
						interval_count: 2,
					},
				],
			},
			false,
		);
	});

	test("add_items vs remove_items of the same feature differ", () => {
		overlaySame(
			{ add_items: [messagesItem()] },
			{ remove_items: [{ feature_id: "messages" }] },
			false,
		);
	});
});

describe("licenseCustomizePatchesAreSame — clear vs leave", () => {
	test("omitted vs omitted / {}", () => {
		expect(
			licenseCustomizePatchesAreSame({ left: undefined, right: undefined }),
		).toBe(true);
		expect(licenseCustomizePatchesAreSame({ left: undefined, right: {} })).toBe(
			true,
		);
		expect(licenseCustomizePatchesAreSame({ left: {}, right: {} })).toBe(true);
	});

	test("null vs null", () => {
		expect(licenseCustomizePatchesAreSame({ left: null, right: null })).toBe(
			true,
		);
	});

	test("null (clear) !== omitted / {}", () => {
		expect(licenseCustomizePatchesAreSame({ left: null, right: undefined })).toBe(
			false,
		);
		expect(licenseCustomizePatchesAreSame({ left: null, right: {} })).toBe(false);
	});

	test("null !== a real overlay", () => {
		expect(
			licenseCustomizePatchesAreSame({
				left: null,
				right: { price: monthPrice({ amount: 20 }) },
			}),
		).toBe(false);
	});
});

describe("planLicensesAreSame — link fields", () => {
	test("identical links", () => {
		linkSame(link(), link());
	});

	test("version and expanded plan are ignored", () => {
		linkSame(
			link({
				version: 1,
				plan: {
					id: "seat",
					name: "Old",
					description: null,
					group: null,
					version: 1,
					add_on: false,
					auto_enable: false,
					price: null,
					items: [],
					created_at: 0,
					env: AppEnv.Sandbox,
					archived: false,
					base_variant_id: null,
					config: { ignore_past_due: false },
					metadata: {},
				},
			}),
			link({ version: 9, plan: undefined }),
			true,
		);
	});

	test("license_plan_id", () => {
		linkSame(link({ license_plan_id: "seat" }), link({ license_plan_id: "pack" }), false);
	});

	test("included: 0 is kept; 0 !== 2", () => {
		linkSame(link({ included: 0 }), link({ included: 0 }), true);
		linkSame(link({ included: 0 }), link({ included: 2 }), false);
	});

	test("prepaid_only true !== false", () => {
		linkSame(link({ prepaid_only: true }), link({ prepaid_only: false }), false);
		linkSame(link({ prepaid_only: false }), link({ prepaid_only: false }), true);
	});

	test("empty customize variants are the same on a link", () => {
		linkSame(link(), link({ customize: null }), true);
		linkSame(link(), link({ customize: {} }), true);
		linkSame(link({ customize: null }), link({ customize: {} }), true);
	});

	test("overlay price change", () => {
		linkSame(
			link({ customize: { price: monthPrice({ amount: 10 }) } }),
			link({ customize: { price: monthPrice({ amount: 20 }) } }),
			false,
		);
	});

	test("empty customize !== { price: null }", () => {
		linkSame(link(), link({ customize: { price: null } }), false);
	});
});

describe("customizePlanLicensesAreSame — patch fields", () => {
	const seat = (overrides: Partial<CustomizePlanLicense> = {}): CustomizePlanLicense => ({
		license_plan_id: "seat",
		...overrides,
	});

	test("same id, no other fields", () => {
		patchSame(seat(), seat());
	});

	test("license_plan_id", () => {
		patchSame(seat(), { license_plan_id: "pack" }, false);
	});

	test("included: omitted !== 0 !== 2", () => {
		patchSame(seat(), seat({ included: undefined }), true);
		patchSame(seat(), seat({ included: 0 }), false);
		patchSame(seat({ included: 0 }), seat({ included: 0 }), true);
		patchSame(seat({ included: 0 }), seat({ included: 2 }), false);
		patchSame(seat({ included: 2 }), seat({ included: 2 }), true);
	});

	test("prepaid_only: omitted !== false !== true", () => {
		patchSame(seat(), seat({ prepaid_only: undefined }), true);
		patchSame(seat(), seat({ prepaid_only: false }), false);
		patchSame(seat(), seat({ prepaid_only: true }), false);
		patchSame(seat({ prepaid_only: false }), seat({ prepaid_only: false }), true);
		patchSame(seat({ prepaid_only: true }), seat({ prepaid_only: false }), false);
	});

	test("customize: omitted === {}; null is clear", () => {
		patchSame(seat(), seat({ customize: undefined }), true);
		patchSame(seat(), seat({ customize: {} }), true);
		patchSame(seat(), seat({ customize: null }), false);
		patchSame(seat({ customize: null }), seat({ customize: null }), true);
		patchSame(
			seat({ customize: { price: monthPrice({ amount: 20 }) } }),
			seat({ customize: { price: monthPrice({ amount: 20 }) } }),
			true,
		);
		patchSame(
			seat({ customize: { price: monthPrice({ amount: 20 }) } }),
			seat({ customize: { price: monthPrice({ amount: 10 }) } }),
			false,
		);
	});

	test("metadata: omitted / {} are empty; keys are compared", () => {
		patchSame(seat(), seat({ metadata: undefined }), true);
		patchSame(seat(), seat({ metadata: {} }), true);
		patchSame(seat({ metadata: { a: 1 } }), seat({ metadata: { a: 1 } }), true);
		patchSame(seat({ metadata: { a: 1 } }), seat(), false);
		patchSame(seat({ metadata: { a: 1 } }), seat({ metadata: { a: 2 } }), false);
		patchSame(
			seat({ metadata: { a: 1, b: 2 } }),
			seat({ metadata: { b: 2, a: 1 } }),
			true,
		);
	});

	test("one field change is not swallowed by another matching field", () => {
		patchSame(
			seat({ included: 2, prepaid_only: true }),
			seat({ included: 2, prepaid_only: false }),
			false,
		);
		patchSame(
			seat({ included: 2, customize: { price: monthPrice({ amount: 20 }) } }),
			seat({ included: 2 }),
			false,
		);
		patchSame(
			seat({ included: 2, metadata: { note: "x" } }),
			seat({ included: 2 }),
			false,
		);
	});
});

describe("removePlanLicensesAreSame", () => {
	test("same id", () => {
		expect(
			removePlanLicensesAreSame({
				left: { license_plan_id: "seat" },
				right: { license_plan_id: "seat" },
			}),
		).toBe(true);
	});

	test("different id", () => {
		expect(
			removePlanLicensesAreSame({
				left: { license_plan_id: "seat" },
				right: { license_plan_id: "pack" },
			}),
		).toBe(false);
	});
});
