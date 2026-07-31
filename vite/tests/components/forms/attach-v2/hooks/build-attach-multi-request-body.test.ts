import { expect, test } from "bun:test";
import {
	type Feature,
	FreeTrialDuration,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import {
	type AttachAdditionalPlan,
	EMPTY_ADDITIONAL_PLAN,
} from "@/components/forms/attach-v2/attachFormSchema";
import {
	type BuildAttachMultiRequestBodyParams,
	buildAttachMultiRequestBody,
} from "@/components/forms/attach-v2/hooks/useAttachMultiRequestBody";
import { applyMultiPlanStageParams } from "@/components/forms/shared/utils/applyMultiPlanStageParams";

const planA = {
	id: "plan-a",
	name: "Plan A",
	items: [],
} as unknown as ProductV2;
const planB = {
	id: "plan-b",
	name: "Plan B",
	items: [],
} as unknown as ProductV2;
const products = [planA, planB];
const features: Feature[] = [];

const additionalPlan = (
	overrides: Partial<AttachAdditionalPlan> = {},
): AttachAdditionalPlan => ({
	...EMPTY_ADDITIONAL_PLAN,
	_id: "extra-1",
	productId: planB.id,
	...overrides,
});

const baseParams = (
	overrides: Partial<BuildAttachMultiRequestBodyParams> = {},
): BuildAttachMultiRequestBodyParams => ({
	customerId: "cus_1",
	entityId: undefined,
	product: planA,
	products,
	features,
	additionalPlans: [additionalPlan()],
	prepaidOptions: {},
	items: null,
	grantFree: false,
	version: undefined,
	trialLength: null,
	trialDuration: FreeTrialDuration.Day,
	trialEnabled: false,
	trialCardRequired: true,
	trialOnEnd: "bill",
	prorationBehavior: null,
	redirectMode: "if_required",
	discounts: [],
	currency: null,
	...overrides,
});

test("builds one multi-attach request containing every selected plan", () => {
	const body = buildAttachMultiRequestBody(baseParams());

	expect(body?.plans).toMatchObject([
		{ plan_id: "plan-a" },
		{ plan_id: "plan-b" },
	]);
});

test("returns null when no additional plan is selected", () => {
	expect(
		buildAttachMultiRequestBody(baseParams({ additionalPlans: [] })),
	).toBeNull();
	expect(
		buildAttachMultiRequestBody(
			baseParams({ additionalPlans: [additionalPlan({ productId: "" })] }),
		),
	).toBeNull();
});

test("returns null while selected plan scopes conflict", () => {
	expect(
		buildAttachMultiRequestBody(baseParams({ hasInvalidPlanScopes: true })),
	).toBeNull();
});

test("returns null without a customer or primary product", () => {
	expect(
		buildAttachMultiRequestBody(baseParams({ customerId: undefined })),
	).toBeNull();
	expect(
		buildAttachMultiRequestBody(baseParams({ product: undefined })),
	).toBeNull();
});

test("maps the form trial onto FreeTrialParamsV1 field names", () => {
	const body = buildAttachMultiRequestBody(
		baseParams({
			trialEnabled: true,
			trialLength: 14,
			trialDuration: FreeTrialDuration.Day,
			trialCardRequired: false,
		}),
	);

	expect(body?.free_trial).toEqual({
		duration_length: 14,
		duration_type: FreeTrialDuration.Day,
		card_required: false,
	});
});

test("sends free_trial null when the trial is off", () => {
	expect(buildAttachMultiRequestBody(baseParams())?.free_trial).toBeNull();
});

test("forwards request-wide trial end behavior", () => {
	const body = buildAttachMultiRequestBody(
		baseParams({
			trialEnabled: true,
			trialLength: 14,
			trialOnEnd: "revert",
		}),
	);

	expect(body?.free_trial?.on_end).toBe("revert");
});

test("forwards request-wide proration behavior", () => {
	const body = buildAttachMultiRequestBody(
		baseParams({ prorationBehavior: "none" }),
	);

	expect(body?.billing_behavior).toBe("none");
});

test("passes entity and currency through", () => {
	const body = buildAttachMultiRequestBody(
		baseParams({
			entityId: "ent_1",
			currency: "EUR",
		}),
	);

	expect(body?.entity_id).toBe("ent_1");
	expect(body?.currency).toBe("eur");
});

test("keeps additional plans customer-level when the primary scope changes", () => {
	const body = buildAttachMultiRequestBody(
		baseParams({ entityId: "ent_default" }),
	);

	expect(body?.plans[1]?.entity_id).toBeNull();
});

test("preserves explicit per-plan entity inheritance and overrides", () => {
	const inherited = buildAttachMultiRequestBody(
		baseParams({
			entityId: "ent_default",
			additionalPlans: [additionalPlan({ entityId: undefined })],
		}),
	);
	const customerLevel = buildAttachMultiRequestBody(
		baseParams({
			entityId: "ent_default",
			additionalPlans: [additionalPlan({ entityId: null })],
		}),
	);
	const entityLevel = buildAttachMultiRequestBody(
		baseParams({
			additionalPlans: [additionalPlan({ entityId: "ent_other" })],
		}),
	);

	expect(inherited?.plans[1]?.entity_id).toBeUndefined();
	expect(customerLevel?.plans[1]?.entity_id).toBeNull();
	expect(entityLevel?.plans[1]?.entity_id).toBe("ent_other");
});

test("forwards per-plan version and prepaid quantities", () => {
	const body = buildAttachMultiRequestBody(
		baseParams({
			version: 3,
			prepaidOptions: { seats: 5 },
			additionalPlans: [
				additionalPlan({
					version: 2,
					prepaidOptions: { messages: 10 },
				}),
			],
		}),
	);

	const [primary, extra] = body?.plans ?? [];
	expect(primary?.version).toBe(3);
	expect(primary?.feature_quantities).toEqual([
		{ feature_id: "seats", quantity: 5 },
	]);
	expect(extra?.version).toBe(2);
	expect(extra?.feature_quantities).toEqual([
		{ feature_id: "messages", quantity: 10 },
	]);
});

test("grant-free removes prices from every plan", () => {
	const paidItem = {
		price: 20,
		interval: "month",
		feature_id: null,
	} as ProductItem;
	const paidPlanA = { ...planA, items: [paidItem] };
	const paidPlanB = { ...planB, items: [paidItem] };
	const body = buildAttachMultiRequestBody(
		baseParams({
			product: paidPlanA,
			products: [paidPlanA, paidPlanB],
			grantFree: true,
		}),
	);

	expect(body?.plans.map((plan) => plan.customize)).toEqual([
		{ price: null, items: [] },
		{ price: null, items: [] },
	]);
});

test("empty item drafts do not create a customization", () => {
	const body = buildAttachMultiRequestBody(baseParams({ items: [] }));

	expect(body?.plans[0]?.customize).toBeUndefined();
});

test("omits discounts that are not fully filled in", () => {
	const body = buildAttachMultiRequestBody(
		baseParams({
			discounts: [{ _id: "d1", reward_id: "" }],
		}),
	);

	expect(body?.discounts).toBeUndefined();
});

test("invoice mode nests the flags under invoice_mode", () => {
	const requestBody = buildAttachMultiRequestBody(baseParams());
	const withInvoice = applyMultiPlanStageParams({
		requestBody,
		useInvoice: true,
		enableProductImmediately: true,
		finalizeInvoice: false,
		netTermsDays: 30,
	});

	expect(withInvoice?.invoice_mode).toEqual({
		enabled: true,
		enable_plan_immediately: true,
		finalize: false,
		net_terms_days: 30,
	});
});

test("checkout mode sets enable_plan_immediately without invoice_mode", () => {
	const requestBody = buildAttachMultiRequestBody(baseParams());
	const withCheckout = applyMultiPlanStageParams({
		requestBody,
		enableProductImmediately: true,
	});

	expect(withCheckout?.enable_plan_immediately).toBe(true);
	expect(withCheckout?.invoice_mode).toBeUndefined();
});

test("stage params on a null body stay null", () => {
	expect(
		applyMultiPlanStageParams({ requestBody: null, useInvoice: true }),
	).toBeNull();
});
