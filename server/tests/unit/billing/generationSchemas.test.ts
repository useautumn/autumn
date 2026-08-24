/**
 * TDD unit test for the billing-request generation schema registry.
 *
 * Contract under test:
 *   - Generation schemas are server-owned subsets of the V1/V0 billing params.
 *   - Keys the dashboard sheets cannot represent are NOT generatable and are
 *     rejected (strict parse), never silently stripped:
 *       attach:   customize.billing_controls, customize.update_items,
 *                 customize.remove_licenses, invoice_mode, redirect_mode,
 *                 long_lived_checkout, checkout_session_params
 *       update:   status, processor_subscription_id, redirect_mode
 *       schedule: invoice_mode, redirect_mode, checkout_session_params,
 *                 enable_plan_immediately
 *   - Seedable fields parse cleanly.
 *
 * Pre-impl red: the module does not exist. Post-impl green: the registry
 * exports attach/update/schedule generation schemas with the exclusions above.
 */

import { describe, expect, test } from "bun:test";
import {
	normalizeGeneratedValue,
	toGenerationOutputSchema,
} from "@/internal/billing/v2/actions/generateRequest/compute/decodeGeneratedValue";
import {
	attachGenerationSchema,
	createScheduleGenerationSchema,
	updateSubscriptionGenerationSchema,
} from "@/internal/billing/v2/actions/generateRequest/generationSchemas";

describe("attachGenerationSchema", () => {
	test("accepts a seedable attach config", () => {
		const parsed = attachGenerationSchema.safeParse({
			plan_id: "pro",
			feature_quantities: [{ feature_id: "messages", quantity: 500 }],
			plan_schedule: "end_of_cycle",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: "day",
					card_required: true,
				},
			},
		});
		expect(parsed.success).toBe(true);
	});

	test("rejects unseedable customize keys", () => {
		for (const customize of [
			{ billing_controls: { spend_limit: 100 } },
			{ update_items: [] },
			{ remove_licenses: [] },
		]) {
			const parsed = attachGenerationSchema.safeParse({
				plan_id: "pro",
				customize,
			});
			expect(parsed.success).toBe(false);
		}
	});

	test("rejects stage-scoped keys", () => {
		for (const extra of [
			{ invoice_mode: { enabled: true } },
			{ redirect_mode: "always" },
			{ long_lived_checkout: true },
			{ checkout_session_params: {} },
		]) {
			const parsed = attachGenerationSchema.safeParse({
				plan_id: "pro",
				...extra,
			});
			expect(parsed.success).toBe(false);
		}
	});
});

describe("updateSubscriptionGenerationSchema", () => {
	test("accepts a seedable cancel config", () => {
		const parsed = updateSubscriptionGenerationSchema.safeParse({
			cancel_action: "cancel_end_of_cycle",
		});
		expect(parsed.success).toBe(true);
	});

	test("rejects internal and stage-scoped keys", () => {
		for (const extra of [
			{ status: "expired" },
			{ processor_subscription_id: "sub_123" },
			{ recalculate_balances: { enabled: true } },
			{ redirect_mode: "always" },
		]) {
			const parsed = updateSubscriptionGenerationSchema.safeParse({
				cancel_action: "cancel_immediately",
				...extra,
			});
			expect(parsed.success).toBe(false);
		}
	});
});

describe("createScheduleGenerationSchema", () => {
	test("inherits the V0 check: starting_after invalid on the first phase", () => {
		const parsed = createScheduleGenerationSchema.safeParse({
			phases: [
				{
					starting_after: { duration_type: "month", duration_count: 1 },
					plans: [{ plan_id: "premium" }],
				},
			],
		});
		expect(parsed.success).toBe(false);
	});

	test("accepts starts_at phases", () => {
		const parsed = createScheduleGenerationSchema.safeParse({
			phases: [{ starts_at: 1750000000000, plans: [{ plan_id: "premium" }] }],
		});
		expect(parsed.success).toBe(true);
	});

	test("rejects stage-scoped keys", () => {
		for (const extra of [
			{ invoice_mode: { enabled: true } },
			{ redirect_mode: "always" },
			{ checkout_session_params: {} },
			{ enable_plan_immediately: true },
			{ currency: "usd" },
			{ discounts: [] },
			{ free_trial: { duration_length: 7, duration_type: "day" } },
		]) {
			const parsed = createScheduleGenerationSchema.safeParse({
				phases: [{ starts_at: 1750000000000, plans: [{ plan_id: "premium" }] }],
				...extra,
			});
			expect(parsed.success).toBe(false);
		}
	});
});

describe("normalizeGeneratedValue", () => {
	test("strips placeholder strings and non-semantic nulls", () => {
		expect(
			normalizeGeneratedValue({
				billing_cycle_anchor: "null",
				currency: null,
				customize: { free_trial: null, price: { amount: 10 } },
				plan_id: "pro",
			}),
		).toEqual({
			customize: { free_trial: null, price: { amount: 10 } },
			plan_id: "pro",
		});
	});

	test("unwraps a single envelope key", () => {
		expect(normalizeGeneratedValue({ args: { plan_id: "pro" } })).toEqual({
			plan_id: "pro",
		});
	});

	test("decodes JSON-string-encoded values and same-key envelopes", () => {
		expect(
			normalizeGeneratedValue({
				additional_plans:
					'{"additional_plans":[{"plan_id":"enterprise","entity_id":"testa"}]}',
				plan_id: "scale",
			}),
		).toEqual({
			additional_plans: [{ entity_id: "testa", plan_id: "enterprise" }],
			plan_id: "scale",
		});
	});

	test("unwraps a lone non-schema key when schema keys are known", () => {
		expect(
			normalizeGeneratedValue(
				{ parameter_name: { plan_id: "scale" } },
				new Set(["plan_id", "customize"]),
			),
		).toEqual({ plan_id: "scale" });
	});

	test("leaves a plain single-field object alone", () => {
		expect(
			normalizeGeneratedValue(
				{ cancel_action: "uncancel" },
				new Set(["cancel_action", "plan_id"]),
			),
		).toEqual({ cancel_action: "uncancel" });
	});
});

describe("toGenerationOutputSchema salvage", () => {
	const validateAttach = async (value: unknown) => {
		const stats = { salvaged: false };
		const schema = toGenerationOutputSchema(attachGenerationSchema, stats);
		const validate = schema.validate;
		if (!validate) throw new Error("schema has no validate");
		return { result: await validate(value), stats };
	};

	test("salvages a payload nested under an unknown wrapper with extras", async () => {
		const { result, stats } = await validateAttach({
			response: {
				metadata: { note: "generated" },
				tool_input: { plan_id: "pro" },
			},
		});
		expect(result.success).toBe(true);
		expect(result.success && result.value).toEqual({ plan_id: "pro" });
		expect(stats.salvaged).toBe(true);
	});

	test("salvages a JSON-string payload under a bogus key", async () => {
		const { result } = await validateAttach({
			result_data: '{"plan_id":"pro"}',
		});
		expect(result.success).toBe(true);
		expect(result.success && result.value).toEqual({ plan_id: "pro" });
	});

	test("does not salvage when nothing validates", async () => {
		const { result, stats } = await validateAttach({ junk: { nothing: true } });
		expect(result.success).toBe(false);
		expect(stats.salvaged).toBe(false);
	});
});
