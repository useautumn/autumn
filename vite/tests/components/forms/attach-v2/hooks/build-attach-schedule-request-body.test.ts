import { expect, test } from "bun:test";
import {
	type Feature,
	FreeTrialDuration,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import type { AttachAdditionalPlan } from "@/components/forms/attach-v2/attachFormSchema";
import {
	type BuildAttachScheduleRequestBodyParams,
	buildAttachScheduleRequestBody,
} from "@/components/forms/attach-v2/hooks/useAttachScheduleRequestBody";
import { applyCreateScheduleStageParams } from "@/components/forms/shared/utils/applyCreateScheduleStageParams";

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
	_id: "extra-1",
	productId: planB.id,
	prepaidOptions: {},
	items: null,
	version: undefined,
	isCustom: false,
	...overrides,
});

const baseParams = (
	overrides: Partial<BuildAttachScheduleRequestBodyParams> = {},
): BuildAttachScheduleRequestBodyParams => ({
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
	redirectMode: "if_required",
	discounts: [],
	currency: null,
	...overrides,
});

test("builds one immediate schedule phase containing every selected plan", () => {
	const body = buildAttachScheduleRequestBody(baseParams());

	expect(body?.phases).toMatchObject([
		{
			starts_at: "now",
			plans: [{ plan_id: "plan-a" }, { plan_id: "plan-b" }],
		},
	]);
	expect(body?.preserve_add_ons).toBe(true);
});

test("returns null when no additional plan is selected", () => {
	expect(
		buildAttachScheduleRequestBody(baseParams({ additionalPlans: [] })),
	).toBeNull();
	expect(
		buildAttachScheduleRequestBody(
			baseParams({ additionalPlans: [additionalPlan({ productId: "" })] }),
		),
	).toBeNull();
});

test("returns null while selected plan scopes conflict", () => {
	expect(
		buildAttachScheduleRequestBody(baseParams({ valid: false })),
	).toBeNull();
});

test("returns null without a customer or primary product", () => {
	expect(
		buildAttachScheduleRequestBody(baseParams({ customerId: undefined })),
	).toBeNull();
	expect(
		buildAttachScheduleRequestBody(baseParams({ product: undefined })),
	).toBeNull();
});

test("maps the form trial onto FreeTrialParamsV1 field names", () => {
	const body = buildAttachScheduleRequestBody(
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
	expect(buildAttachScheduleRequestBody(baseParams())?.free_trial).toBeNull();
});

test("omits unsupported trial end behavior", () => {
	const body = buildAttachScheduleRequestBody(
		baseParams({
			trialEnabled: true,
			trialLength: 14,
		}),
	);

	expect(body?.free_trial?.on_end).toBeUndefined();
});

test("passes entity and currency through", () => {
	const body = buildAttachScheduleRequestBody(
		baseParams({
			entityId: "ent_1",
			currency: "EUR",
		}),
	);

	expect(body?.entity_id).toBe("ent_1");
	expect(body?.currency).toBe("eur");
});

test("preserves per-plan entity inheritance and overrides", () => {
	const inherited = buildAttachScheduleRequestBody(
		baseParams({ entityId: "ent_default" }),
	);
	const customerLevel = buildAttachScheduleRequestBody(
		baseParams({
			entityId: "ent_default",
			additionalPlans: [additionalPlan({ entityId: null })],
		}),
	);
	const entityLevel = buildAttachScheduleRequestBody(
		baseParams({
			additionalPlans: [additionalPlan({ entityId: "ent_other" })],
		}),
	);

	expect(inherited?.phases[0].plans[1]?.entity_id).toBeUndefined();
	expect(customerLevel?.phases[0].plans[1]?.entity_id).toBeNull();
	expect(entityLevel?.phases[0].plans[1]?.entity_id).toBe("ent_other");
});

test("forwards per-plan version and prepaid quantities", () => {
	const body = buildAttachScheduleRequestBody(
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

	const [primary, extra] = body?.phases[0].plans ?? [];
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
	const body = buildAttachScheduleRequestBody(
		baseParams({
			product: paidPlanA,
			products: [paidPlanA, paidPlanB],
			grantFree: true,
		}),
	);

	expect(body?.phases[0].plans.map((plan) => plan.customize)).toEqual([
		{ price: null, items: [] },
		{ price: null, items: [] },
	]);
});

test("empty item drafts do not create a customization", () => {
	const body = buildAttachScheduleRequestBody(baseParams({ items: [] }));

	expect(body?.phases[0].plans[0]?.customize).toBeUndefined();
});

test("omits discounts that are not fully filled in", () => {
	const body = buildAttachScheduleRequestBody(
		baseParams({
			discounts: [{ _id: "d1", reward_id: "" }],
		}),
	);

	expect(body?.discounts).toBeUndefined();
});

test("invoice mode nests the flags under invoice_mode", () => {
	const requestBody = buildAttachScheduleRequestBody(baseParams());
	const withInvoice = applyCreateScheduleStageParams({
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
	const requestBody = buildAttachScheduleRequestBody(baseParams());
	const withCheckout = applyCreateScheduleStageParams({
		requestBody,
		enableProductImmediately: true,
	});

	expect(withCheckout?.enable_plan_immediately).toBe(true);
	expect(withCheckout?.invoice_mode).toBeUndefined();
});

test("stage params on a null body stay null", () => {
	expect(
		applyCreateScheduleStageParams({ requestBody: null, useInvoice: true }),
	).toBeNull();
});
