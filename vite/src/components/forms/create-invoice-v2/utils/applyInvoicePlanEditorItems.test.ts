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
			items: catalogItems,
		});

		expect(edited).toEqual(plan({ items: catalogItems, isCustom: true }));
	});

	test("an overage quantity is dropped once the editor removes the feature's prepaid price", () => {
		const edited = applyInvoicePlanEditorItems({
			plan: plan({
				items: items([
					{ feature_id: "words", usage_model: UsageModel.Prepaid, price: 5 },
					...catalogItems,
				]),
				overageQuantities: { words: 40 },
			}),
			items: catalogItems,
		});

		expect(edited.overageQuantities).toEqual({});
	});

	test("keeps the overage quantity while the feature is priced both ways", () => {
		const both = items([
			{ feature_id: "words", usage_model: UsageModel.Prepaid, price: 5 },
			...catalogItems,
		]);
		const edited = applyInvoicePlanEditorItems({
			plan: plan({ items: both, overageQuantities: { words: 40 } }),
			items: both,
		});

		expect(edited.overageQuantities).toEqual({ words: 40 });
	});
});
