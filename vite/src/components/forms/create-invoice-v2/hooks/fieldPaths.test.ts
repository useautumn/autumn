import { describe, expect, test } from "bun:test";
import { FormApi } from "@tanstack/react-form";
import type { CreateInvoiceForm } from "../createInvoiceFormSchema";

const baseForm = (): CreateInvoiceForm => ({
	plans: [
		{
			_id: "p1",
			planId: "pro",
			version: undefined,
			items: null,
			isCustom: false,
			featureQuantities: {},
			featureUsage: {},
			licenses: [
				{
					_id: "l1",
					licensePlanId: "editor",
					quantity: 2,
					featureQuantities: {},
					featureUsage: {},
					prorate: undefined,
				},
			],
			prorate: undefined,
			entityId: null,
			period: null,
			featurePeriods: {},
			overageQuantities: {},
		},
	],
	customLineItems: [],
	discounts: [],
	invoiceTemplateId: null,
	netTermsDays: null,
	paymentMethodTypes: null,
	taxRateId: null,
	periodStart: null,
	periodEnd: null,
	issueDay: null,
});

/** Quantity fields mount on keys that do not exist yet, so writes must not need an intermediate. */
describe("quantity field paths", () => {
	test("writes a quantity for a feature with no entry yet", () => {
		const form = new FormApi({ defaultValues: baseForm() });
		form.mount();

		form.setFieldValue("plans[0].featureQuantities.seats", 5);

		expect(form.state.values.plans[0].featureQuantities.seats).toBe(5);
	});

	test("writes a license quantity for a feature with no entry yet", () => {
		const form = new FormApi({ defaultValues: baseForm() });
		form.mount();

		form.setFieldValue("plans[0].licenses[0].featureQuantities.exports", 100);

		expect(
			form.state.values.plans[0].licenses[0].featureQuantities.exports,
		).toBe(100);
	});

	test("keeps quantity and usage independent", () => {
		const form = new FormApi({ defaultValues: baseForm() });
		form.mount();

		form.setFieldValue("plans[0].featureUsage.credits", [
			{ feature_id: "requests", quantity: 10 },
		]);
		form.setFieldValue("plans[0].featureQuantities.credits", 7);

		expect(form.state.values.plans[0].featureQuantities.credits).toBe(7);
		expect(form.state.values.plans[0].featureUsage.credits).toEqual([
			{ feature_id: "requests", quantity: 10 },
		]);
	});

	test("two rows of the same plan at different entities never share a quantity", () => {
		const base = baseForm();
		const form = new FormApi({
			defaultValues: {
				...base,
				plans: [
					{ ...base.plans[0], _id: "a", entityId: "workspace_a" },
					{ ...base.plans[0], _id: "b", entityId: "workspace_b" },
				],
			},
		});
		form.mount();

		form.setFieldValue("plans[0].featureQuantities.seats", 3);
		form.setFieldValue("plans[1].featureQuantities.seats", 7);

		expect(
			form.state.values.plans.map((plan) => plan.featureQuantities.seats),
		).toEqual([3, 7]);
	});
});
