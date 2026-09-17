import { describe, expect, test } from "bun:test";
import { UsageModel } from "@autumn/shared";
import type { CreateInvoiceForm } from "../createInvoiceFormSchema";
import { buildCreateInvoiceRequestBody } from "./useCreateInvoiceRequestBody";

const emptyForm = (): CreateInvoiceForm => ({
	plans: [],
	customLineItems: [],
	discounts: [],
	invoiceTemplateId: null,
	netTermsDays: null,
	taxRateId: null,
	periodStart: null,
	periodEnd: null,
});

const planItems = [
	{ feature_id: "seats", usage_model: UsageModel.Prepaid },
	{ feature_id: "credits", usage_model: UsageModel.PayPerUse },
] as CreateInvoiceForm["plans"][number]["items"];

const planWith = (
	overrides: Partial<CreateInvoiceForm["plans"][number]> = {},
): CreateInvoiceForm["plans"][number] => ({
	_id: "p1",
	planId: "pro",
	version: undefined,
	items: planItems,
	isCustom: false,
	featureQuantities: {},
	featureUsage: {},
	licenses: [],
	prorate: undefined,
	...overrides,
});

describe("buildCreateInvoiceRequestBody", () => {
	test("returns null without a customer", () => {
		expect(
			buildCreateInvoiceRequestBody({
				customerId: undefined,
				form: { ...emptyForm(), plans: [planWith()] },
			}),
		).toBeNull();
	});

	test("returns null when there is nothing to charge", () => {
		expect(
			buildCreateInvoiceRequestBody({
				customerId: "cus_1",
				form: emptyForm(),
			}),
		).toBeNull();
	});

	test("bills custom line items with no plan", () => {
		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				netTermsDays: 14,
				customLineItems: [
					{ _id: "c1", description: " Implementation ", amount: 500 },
					{ _id: "c2", description: "", amount: 250 },
					{ _id: "c3", description: "Skipped", amount: "" },
				],
			},
		});

		expect(body).toEqual({
			customer_id: "cus_1",
			custom_line_items: [{ description: "Implementation", amount: 500 }],
			net_terms_days: 14,
		});
	});

	test("derives billing_behavior from each item's usage model", () => {
		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				plans: [
					planWith({
						featureQuantities: {
							seats: 5,
							credits: 2500,
						},
					}),
				],
			},
		});

		expect(body?.plans?.[0].feature_quantities).toEqual([
			{ feature_id: "seats", billing_behavior: "prepaid", quantity: 5 },
			{
				feature_id: "credits",
				billing_behavior: "usage_based",
				quantity: 2500,
			},
		]);
	});

	test("sends usage instead of quantity, never both", () => {
		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				plans: [
					planWith({
						featureQuantities: { credits: 999 },
						featureUsage: {
							credits: [
								{ feature_id: "requests", quantity: 1000 },
								{ feature_id: "requests", quantity: 0 },
							],
						},
					}),
				],
			},
		});

		const quantity = body?.plans?.[0].feature_quantities?.[0];
		expect(quantity).toEqual({
			feature_id: "credits",
			billing_behavior: "usage_based",
			usage: [{ feature_id: "requests", quantity: 1000 }],
		});
		expect(quantity).not.toHaveProperty("quantity");
	});

	test("omits prorate so the server default applies", () => {
		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				plans: [
					planWith({
						featureQuantities: {
							seats: 5,
							credits: 10,
						},
					}),
				],
			},
		});

		for (const quantity of body?.plans?.[0].feature_quantities ?? []) {
			expect(quantity).not.toHaveProperty("prorate");
		}
	});

	test("drops the base price when the editor removed that item", () => {
		const featureOnlyItems = [
			{ feature_id: "credits", usage_model: UsageModel.PayPerUse },
		] as CreateInvoiceForm["plans"][number]["items"];

		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				plans: [
					planWith({
						isCustom: true,
						items: featureOnlyItems,
						featureQuantities: { credits: 2500 },
					}),
				],
			},
		});

		expect(body?.plans?.[0].customize).toMatchObject({ price: null });
	});

	test("keeps the base price when the edited items still carry one", () => {
		const withBasePrice = [
			{ feature_id: null, price: 20 },
			{ feature_id: "credits", usage_model: UsageModel.PayPerUse },
		] as CreateInvoiceForm["plans"][number]["items"];

		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				plans: [planWith({ isCustom: true, items: withBasePrice })],
			},
		});

		expect(body?.plans?.[0].customize).not.toHaveProperty("price");
	});

	test("omits customize entirely when catalog priced", () => {
		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				plans: [planWith({ featureQuantities: { seats: 1 } })],
			},
		});

		expect(body?.plans?.[0]).not.toHaveProperty("customize");
	});

	test("maps licenses with their own feature quantities", () => {
		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				plans: [
					planWith({
						licenses: [
							{
								_id: "l1",
								licensePlanId: "editor",
								quantity: 3,
								featureQuantities: { credits: 100 },
								featureUsage: {},
								prorate: undefined,
							},
							{
								_id: "l2",
								licensePlanId: "viewer",
								quantity: undefined,
								featureQuantities: {},
								featureUsage: {},
								prorate: undefined,
							},
						],
					}),
				],
			},
		});

		expect(body?.plans?.[0].license_quantities).toEqual([
			{
				license_plan_id: "editor",
				quantity: 3,
				feature_quantities: [
					{
						feature_id: "credits",
						billing_behavior: "usage_based",
						quantity: 100,
					},
				],
			},
		]);
	});

	test("sends the period as a pair and flags preview", () => {
		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			preview: true,
			form: {
				...emptyForm(),
				periodStart: 1789430400000,
				periodEnd: 1792022400000,
				customLineItems: [{ _id: "c1", description: "Setup", amount: 10 }],
			},
		});

		expect(body).toMatchObject({
			period_start: 1789430400000,
			period_end: 1792022400000,
			preview: true,
		});
	});

	test("ignores a half-set period", () => {
		const body = buildCreateInvoiceRequestBody({
			customerId: "cus_1",
			form: {
				...emptyForm(),
				periodStart: 1789430400000,
				customLineItems: [{ _id: "c1", description: "Setup", amount: 10 }],
			},
		});

		expect(body).not.toHaveProperty("period_start");
		expect(body).not.toHaveProperty("period_end");
	});
});
