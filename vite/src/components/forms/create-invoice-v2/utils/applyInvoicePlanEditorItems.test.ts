import { describe, expect, test } from "bun:test";
import { type ProductItem, UsageModel } from "@autumn/shared";
import type {
	CreateInvoiceForm,
	FormInvoicePlan,
} from "../createInvoiceFormSchema";
import { buildCreateInvoiceRequestBody } from "../hooks/useCreateInvoiceRequestBody";
import { applyInvoicePlanEditorItems } from "./applyInvoicePlanEditorItems";

const items = (list: unknown[]) => list as ProductItem[];

const catalogItems = items([
	{ feature_id: "seats", usage_model: UsageModel.Prepaid, price: 10 },
	{ feature_id: "words", usage_model: UsageModel.PayPerUse, price: 0.05 },
]);

const plan = (overrides: Partial<FormInvoicePlan> = {}): FormInvoicePlan => ({
	_id: "p1",
	planId: "pro",
	version: undefined,
	items: null,
	isCustom: false,
	featureQuantities: { seats: 5, words: 10 },
	featureUsage: {
		words: [{ feature_id: "requests", quantity: 3 }],
	},
	licenses: [],
	prorate: undefined,
	entityId: null,
	period: null,
	featurePeriods: {},
	overageQuantities: {},
	...overrides,
});

const invoiceFor = (invoicePlan: FormInvoicePlan) =>
	buildCreateInvoiceRequestBody({
		customerId: "cus_1",
		catalogItemsByPlanId: new Map([["pro", catalogItems]]),
		form: {
			plans: [invoicePlan],
			customLineItems: [],
			discounts: [],
			invoiceTemplateId: null,
			netTermsDays: null,
			taxRateId: null,
			periodStart: null,
			periodEnd: null,
			issueDay: null,
		} satisfies CreateInvoiceForm,
	});

describe("applyInvoicePlanEditorItems", () => {
	test("a feature deleted in the plan editor is no longer billed", () => {
		const edited = applyInvoicePlanEditorItems({
			plan: plan(),
			previousItems: catalogItems,
			items: items([catalogItems[0]]),
		});

		expect(edited.featureQuantities).toEqual({ seats: 5 });
		expect(edited.featureUsage).toEqual({});
		expect(invoiceFor(edited)?.plans?.[0].feature_quantities).toEqual([
			{ feature_id: "seats", billing_behavior: "prepaid", quantity: 5 },
		]);
	});

	test("a feature the editor turns into a free grant is no longer billed", () => {
		const edited = applyInvoicePlanEditorItems({
			plan: plan(),
			previousItems: catalogItems,
			items: items([
				catalogItems[0],
				{ feature_id: "words", included_usage: 100 },
			]),
		});

		expect(edited.featureQuantities).toEqual({ seats: 5 });
		expect(edited.featureUsage).toEqual({});
	});

	test("keeps quantities for features the editor still bills", () => {
		const edited = applyInvoicePlanEditorItems({
			plan: plan(),
			previousItems: catalogItems,
			items: catalogItems,
		});

		expect(edited).toEqual(plan({ items: catalogItems, isCustom: true }));
	});

	const wordsBothWays = items([
		{ feature_id: "words", usage_model: UsageModel.Prepaid, price: 5 },
		...catalogItems,
	]);
	const wordsPrepaidOnly = items([
		catalogItems[0],
		{ feature_id: "words", usage_model: UsageModel.Prepaid, price: 5 },
	]);

	test("removing the prepaid price bills only the usage units the user entered", () => {
		const edited = applyInvoicePlanEditorItems({
			plan: plan({
				items: wordsBothWays,
				featureQuantities: { seats: 5, words: 1000 },
				overageQuantities: { words: 400 },
				featureUsage: {},
			}),
			previousItems: wordsBothWays,
			items: catalogItems,
		});

		expect(edited.featureQuantities).toEqual({ seats: 5, words: 400 });
		expect(edited.overageQuantities).toEqual({});
		expect(invoiceFor(edited)?.plans?.[0].feature_quantities).toContainEqual({
			feature_id: "words",
			billing_behavior: "usage_based",
			quantity: 400,
		});
	});

	test("removing the usage price keeps the prepaid units and drops the usage units", () => {
		const edited = applyInvoicePlanEditorItems({
			plan: plan({
				items: wordsBothWays,
				featureQuantities: { seats: 5, words: 1000 },
				overageQuantities: { words: 400 },
				featureUsage: {},
			}),
			previousItems: wordsBothWays,
			items: wordsPrepaidOnly,
		});

		expect(edited.featureQuantities).toEqual({ seats: 5, words: 1000 });
		expect(edited.overageQuantities).toEqual({});
	});

	test("a prepaid quantity is never reused when the price turns usage-based", () => {
		const edited = applyInvoicePlanEditorItems({
			plan: plan({
				items: wordsPrepaidOnly,
				featureQuantities: { seats: 5, words: 1000 },
				featureUsage: {},
			}),
			previousItems: wordsPrepaidOnly,
			items: catalogItems,
		});

		expect(edited.featureQuantities).toEqual({ seats: 5 });
	});

	test("keeps both quantities while the feature is priced both ways", () => {
		const edited = applyInvoicePlanEditorItems({
			plan: plan({
				items: wordsBothWays,
				featureQuantities: { seats: 5, words: 1000 },
				overageQuantities: { words: 40 },
			}),
			previousItems: wordsBothWays,
			items: wordsBothWays,
		});

		expect(edited.featureQuantities).toEqual({ seats: 5, words: 1000 });
		expect(edited.overageQuantities).toEqual({ words: 40 });
	});
});
