/**
 * Braintrust evals for the billing-request generation endpoint's LLM core.
 * Runs `computeGeneratedParams` directly (no server, no DB) against fixture
 * contexts, scoring schema validity and expected-field extraction.
 *
 * Run: bun eval:generation  (needs ANTHROPIC_API_KEY + BRAINTRUST_API_KEY)
 */

import {
	type ApiPlanV1,
	applyCustomizeToPlan,
	composeMatchKey,
	type DiffablePlanV1,
} from "@autumn/shared";
import { Eval } from "braintrust";
import { computeGeneratedParams } from "@/internal/billing/v2/actions/generateRequest/compute/computeGeneratedParams";
import type {
	GenerateBillingTool,
	GeneratedBillingParams,
} from "@/internal/billing/v2/actions/generateRequest/generationSchemas";
import type { GenerationContext } from "@/internal/billing/v2/actions/generateRequest/setup/setupGenerationContext";
import {
	creditLadderContext,
	entityScaleContext,
	rolloverCreditsBaseItems,
	rolloverCreditsContext,
	saasContext,
	tieredScaleBaseItems,
	tieredScaleContext,
	variantLadderContext,
} from "./fixtures";

type EvalInput = {
	tool: GenerateBillingTool;
	prompt: string;
	context: GenerationContext;
	currentRequest?: Record<string, unknown>;
	forbiddenKeys?: string[];
	applyToItems?: ApiPlanV1["items"];
	expectedApplied?: Record<string, unknown>[];
};

type EvalOutput = {
	params: GeneratedBillingParams | null;
	repaired: boolean;
	repairReason?: string;
	error?: string;
};

type EvalCase = {
	name: string;
	input: EvalInput;
	expected: Record<string, unknown>;
};

/** Every expected key must match; arrays match when each expected element
 * subset-matches some output element. */
const subsetMatches = (
	expected: unknown,
	actual: unknown,
	path: string,
	mismatches: string[],
): void => {
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual)) {
			mismatches.push(`${path}: expected array, got ${typeof actual}`);
			return;
		}
		for (const [index, expectedElement] of expected.entries()) {
			const matched = actual.some((actualElement) => {
				const elementMismatches: string[] = [];
				subsetMatches(expectedElement, actualElement, path, elementMismatches);
				return elementMismatches.length === 0;
			});
			if (!matched) {
				mismatches.push(
					`${path}[${index}]: no element matches ${JSON.stringify(expectedElement)}`,
				);
			}
		}
		return;
	}
	if (expected !== null && typeof expected === "object") {
		if (actual === null || typeof actual !== "object") {
			mismatches.push(`${path}: expected object, got ${typeof actual}`);
			return;
		}
		for (const [key, value] of Object.entries(expected)) {
			subsetMatches(
				value,
				(actual as Record<string, unknown>)[key],
				`${path}.${key}`,
				mismatches,
			);
		}
		return;
	}
	if (expected !== actual) {
		mismatches.push(
			`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
	}
};

const schemaFirstTry = ({
	input,
	output,
}: {
	input: EvalInput;
	output: EvalOutput;
}) => {
	if (output.repaired || !output.params) {
		console.warn(
			`[schema_first_try] ${input.tool}: "${input.prompt}" -> ${output.error ?? `repaired on retry: ${output.repairReason}`}`,
		);
	}
	return {
		name: "schema_first_try",
		score: output.params ? (output.repaired ? 0.5 : 1) : 0,
		...(output.error ? { metadata: { error: output.error } } : {}),
	};
};

const expectedParams = ({
	input,
	output,
	expected,
}: {
	input: EvalInput;
	output: EvalOutput;
	expected?: Record<string, unknown>;
}) => {
	if (!output.params) {
		return { name: "expected_params", score: 0 };
	}
	const mismatches: string[] = [];
	subsetMatches(expected ?? {}, output.params, "params", mismatches);
	for (const key of input.forbiddenKeys ?? []) {
		const value = Object.entries(output.params).find(
			([paramKey]) => paramKey === key,
		)?.[1];
		if (value !== undefined) {
			mismatches.push(`params.${key}: expected to be absent`);
		}
	}
	if (mismatches.length) {
		console.warn(
			`[expected_params] ${input.tool}: "${input.prompt}"\n  ${mismatches.join("\n  ")}`,
		);
	}
	return {
		name: "expected_params",
		score: mismatches.length === 0 ? 1 : 0,
		...(mismatches.length ? { metadata: { mismatches } } : {}),
	};
};

const appliedPlan = ({
	input,
	output,
}: {
	input: EvalInput;
	output: EvalOutput;
}) => {
	if (!input.applyToItems || !output.params) return null;
	const mismatches: string[] = [];
	const customize =
		"customize" in output.params ? output.params.customize : undefined;
	if (!customize) {
		mismatches.push("applied: no customize in output");
	}
	const applied = customize
		? applyCustomizeToPlan({
				customize,
				plan: { items: input.applyToItems, price: null } as DiffablePlanV1,
			})
		: { items: input.applyToItems };
	const keyCounts = new Map<string, number>();
	for (const item of applied.items) {
		const key = composeMatchKey(item);
		keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
	}
	for (const [key, count] of keyCounts) {
		if (count > 1) {
			mismatches.push(`applied: ${count} items share identity ${key}`);
		}
	}
	subsetMatches(
		input.expectedApplied ?? [],
		applied.items,
		"applied",
		mismatches,
	);
	if (mismatches.length) {
		console.warn(
			`[applied_plan] ${input.tool}: "${input.prompt}"\n  ${mismatches.join("\n  ")}`,
		);
	}
	return {
		name: "applied_plan",
		score: mismatches.length === 0 ? 1 : 0,
		...(mismatches.length ? { metadata: { mismatches } } : {}),
	};
};

const cases: EvalCase[] = [
	{
		name: "attach: plan with day trial",
		input: {
			context: saasContext(),
			prompt: "Attach the pro plan with a 14 day free trial",
			tool: "attach",
		},
		expected: {
			customize: {
				free_trial: { duration_length: 14, duration_type: "day" },
			},
			plan_id: "pro",
		},
	},
	{
		name: "attach: prepaid quantity at end of cycle",
		input: {
			context: saasContext(),
			prompt:
				"Attach the pro plan with 500 prepaid messages, taking effect at the end of the current billing cycle",
			tool: "attach",
		},
		expected: {
			feature_quantities: [{ feature_id: "messages", quantity: 500 }],
			plan_id: "pro",
			plan_schedule: "end_of_cycle",
		},
	},
	{
		name: "attach: prompt cannot smuggle customer_id",
		input: {
			context: saasContext(),
			forbiddenKeys: ["customer_id"],
			prompt: "Attach the premium plan for customer some-other-customer",
			tool: "attach",
		},
		expected: { plan_id: "premium" },
	},
	{
		name: "attach: custom base price + included credits on tiered ladder",
		input: {
			context: creditLadderContext(),
			prompt: "Attach enterprise at 10k/mo -- add 2k included credits not 1k",
			tool: "attach",
		},
		expected: {
			customize: {
				add_items: [{ feature_id: "credits", included: 2000 }],
				price: { amount: 10000, interval: "month" },
				remove_items: [{ feature_id: "credits" }],
			},
			plan_id: "enterprise",
		},
	},
	{
		name: "attach: ambiguous plan variant still picks a plan",
		input: {
			context: variantLadderContext(),
			prompt: "attach scale at 2k/mo and 2k included credits",
			tool: "attach",
		},
		expected: {
			customize: {
				add_items: [{ feature_id: "credits", included: 2000 }],
				price: { amount: 2000, interval: "month" },
				remove_items: [{ feature_id: "credits" }],
			},
			plan_id: "scale",
		},
	},
	{
		name: "attach: two plans together -> additional_plans",
		input: {
			context: saasContext(),
			prompt: "Attach both the pro and premium plans to this customer",
			tool: "attach",
		},
		expected: {
			additional_plans: [{ plan_id: "premium" }],
			plan_id: "pro",
		},
	},
	{
		name: "attach: mixed customer-level and entity-scoped plans",
		input: {
			context: saasContext(),
			prompt:
				"attach pro at the customer level and premium onto the testa entity",
			tool: "attach",
		},
		expected: {
			additional_plans: [{ entity_id: "testa", plan_id: "premium" }],
			plan_id: "pro",
		},
	},
	{
		name: "attach: composite multi + entity + included allowance",
		input: {
			context: variantLadderContext(),
			prompt:
				"attach scale at 2.34k/mo and then on the entity level (testa) attach enterprise at 3k/quarter -- also 2k credits included on enterprise",
			tool: "attach",
		},
		expected: {
			additional_plans: [
				{
					customize: {
						add_items: [{ feature_id: "credits", included: 2000 }],
					},
					entity_id: "testa",
					plan_id: "enterprise",
				},
			],
			customize: { price: { amount: 2340, interval: "month" } },
			plan_id: "scale",
		},
	},
	{
		name: "attach: composite with explicit customer-level primary",
		input: {
			context: variantLadderContext(),
			prompt:
				"attach scale at 2.345k/mo on the customer level and enterprise at 5k/mo on the testa entity with 2k credits included",
			tool: "attach",
		},
		expected: {
			additional_plans: [
				{
					customize: {
						add_items: [{ feature_id: "credits", included: 2000 }],
						price: { amount: 5000, interval: "month" },
					},
					entity_id: "testa",
					plan_id: "enterprise",
				},
			],
			customize: { price: { amount: 2345, interval: "month" } },
			plan_id: "scale",
		},
	},
	{
		name: "attach: edit mode preserves plan, changes trial",
		input: {
			context: saasContext(),
			currentRequest: {
				customize: {
					free_trial: { duration_length: 14, duration_type: "day" },
				},
				plan_id: "pro",
			},
			prompt: "Change the trial to 30 days",
			tool: "attach",
		},
		expected: {
			customize: {
				free_trial: { duration_length: 30, duration_type: "day" },
			},
			plan_id: "pro",
		},
	},
	{
		name: "update: cancel at end of cycle",
		input: {
			context: saasContext({ onPro: true }),
			prompt: "Cancel this subscription at the end of the billing period",
			tool: "update_subscription",
		},
		expected: { cancel_action: "cancel_end_of_cycle" },
	},
	{
		name: "update: cancel now with prorated refund",
		input: {
			context: saasContext({ onPro: true }),
			prompt:
				"Cancel this subscription immediately and refund the unused part of the month",
			tool: "update_subscription",
		},
		expected: {
			cancel_action: "cancel_immediately",
			refund_last_payment: "prorated",
		},
	},
	{
		name: "update: uncancel",
		input: {
			context: saasContext({ onPro: true }),
			prompt: "They changed their mind — undo the pending cancellation",
			tool: "update_subscription",
		},
		expected: { cancel_action: "uncancel" },
	},
	{
		name: "update: bump prepaid quantity",
		input: {
			context: saasContext({ onPro: true }),
			prompt: "Bump them up to 1000 prepaid messages",
			tool: "update_subscription",
		},
		expected: {
			feature_quantities: [{ feature_id: "messages", quantity: 1000 }],
		},
	},
	{
		name: "update: change credits allowance preserves rollover (live-incident shape)",
		input: {
			applyToItems: rolloverCreditsBaseItems(),
			context: rolloverCreditsContext(),
			currentRequest: {
				customer_id: "cus_mintlify_like",
				customer_product_id: "cp_pro_1",
				product_id: "pro",
			},
			expectedApplied: [
				{
					feature_id: "AI_CREDITS",
					included: 12_000,
					pooled: true,
					reset: { interval: "month" },
					rollover: { max_percentage: 50 },
				},
				{ feature_id: "AI_CREDITS", price: { amount: 0.01 } },
			],
			prompt: "update credits to 12k",
			tool: "update_subscription",
		},
		expected: {
			customize: {
				add_items: [
					{
						feature_id: "AI_CREDITS",
						included: 12_000,
						pooled: true,
						reset: { interval: "month" },
						rollover: { max_percentage: 50 },
					},
				],
				remove_items: [{ feature_id: "AI_CREDITS" }],
			},
		},
	},
	{
		name: "update: raising included on a tiered item shifts boundaries and keeps tiers",
		input: {
			applyToItems: tieredScaleBaseItems(),
			context: tieredScaleContext(),
			currentRequest: {
				customer_id: "cus_scale",
				customer_product_id: "cp_scale_1",
				product_id: "scale",
			},
			expectedApplied: [
				{
					feature_id: "credits",
					included: 2000,
					price: {
						billing_method: "prepaid",
						billing_units: 1000,
						tiers: [
							{ amount: 0, flat_amount: 200, to: 4000 },
							{ amount: 0, flat_amount: 400, to: 7000 },
							{ amount: 0, flat_amount: 600, to: "inf" },
						],
					},
					reset: { interval: "month" },
				},
				{ feature_id: "credits", price: { amount: 0.1 } },
			],
			prompt: "lets do 2k credits included",
			tool: "update_subscription",
		},
		expected: {
			customize: {
				add_items: [{ feature_id: "credits", included: 2000 }],
				remove_items: [{ feature_id: "credits" }],
			},
		},
	},
	{
		name: "attach: entity scoping read from current_plans",
		input: {
			context: entityScaleContext(),
			prompt: "attach scale to the entity that doesn't have it yet",
			tool: "attach",
		},
		expected: { entity_id: "beta", plan_id: "scale" },
	},
	{
		name: "schedule: switch plan next month",
		input: {
			context: saasContext({ onPro: true }),
			prompt: "Switch this customer to the premium plan starting next month",
			tool: "create_schedule",
		},
		expected: {
			phases: [{ plans: [{ plan_id: "premium" }] }],
		},
	},
	{
		name: "schedule: two-phase ramp with custom prices",
		input: {
			context: creditLadderContext(),
			prompt: "Put them on enterprise: year 1 at $10k/mo, year 2 at $12k/mo",
			tool: "create_schedule",
		},
		expected: {
			phases: [
				{
					plans: [
						{
							customize: { price: { amount: 10000 } },
							plan_id: "enterprise",
						},
					],
					starts_at: "now",
				},
				{
					plans: [
						{
							customize: { price: { amount: 12000 } },
							plan_id: "enterprise",
						},
					],
					starting_after: { duration_count: 1, duration_type: "year" },
				},
			],
		},
	},
	{
		name: "schedule: per-plan entity scoping and customize stay independent",
		input: {
			context: entityScaleContext(),
			prompt:
				"starting next month, put enterprise on the alpha entity at $10k per year and scale on the beta entity",
			tool: "create_schedule",
		},
		expected: {
			phases: [
				{
					plans: [
						{
							customize: { price: { amount: 10000, interval: "year" } },
							entity_id: "alpha",
							plan_id: "enterprise",
						},
						{ entity_id: "beta", plan_id: "scale" },
					],
				},
			],
		},
	},
	{
		name: "schedule: per-plan item customize uses remove+add",
		input: {
			context: entityScaleContext(),
			prompt:
				"next month move them onto scale but with 2k credits included instead of 1k",
			tool: "create_schedule",
		},
		expected: {
			phases: [
				{
					plans: [
						{
							customize: {
								add_items: [{ feature_id: "credits", included: 2000 }],
								remove_items: [{ feature_id: "credits" }],
							},
							plan_id: "scale",
						},
					],
				},
			],
		},
	},
];

Eval("generate-billing-request", {
	data: () =>
		cases.map(({ name, input, expected }) => ({
			expected,
			input,
			metadata: { tool: input.tool },
			tags: [input.tool],
			// biome-ignore lint/suspicious/noExplicitAny: braintrust's case type is looser than ours
		})) as any,
	scores: [schemaFirstTry, expectedParams, appliedPlan],
	task: async (input: EvalInput): Promise<EvalOutput> => {
		try {
			const { params, repaired, repairReason } = await computeGeneratedParams({
				context: input.context,
				currentRequest: input.currentRequest,
				prompt: input.prompt,
				tool: input.tool,
			});
			return { params, repaired, repairReason };
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
				params: null,
				repaired: false,
			};
		}
	},
});
