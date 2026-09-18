import { expect, test } from "bun:test";
import {
	addIncludedToTiers,
	subtractIncludedFromTiers,
} from "../../../shared/utils/productV2Utils/productItemUtils/tierUtils.js";
import type { ToolCall } from "../lib/context.js";
import {
	buildEffectivePlanEvidence,
	buildPricedAllowanceEquivalenceEvidence,
	buildPricedAllowanceRepairGuidance,
	detectPricedAllowanceRemovals,
} from "../lib/planEconomics.js";

const prepaid = {
	feature_id: "credits",
	included: 100,
	reset: { interval: "month" },
	price: {
		billing_method: "prepaid",
		interval: "month",
		tier_behavior: "volume",
		tiers: [
			{ to: 200, amount: 0, flat_amount: 20 },
			{ to: "inf", amount: 0, flat_amount: 30 },
		],
	},
};
const overage = {
	feature_id: "credits",
	included: 0,
	price: { billing_method: "usage_based", amount: 0.1, interval: "month" },
};
const plan = {
	id: "pro",
	version: 1,
	price: null,
	items: [
		prepaid,
		overage,
		{ feature_id: "history", included: 1, unlimited: true, price: null },
	],
};
const customize = {
	remove_items: [{ feature_id: "credits", billing_method: "prepaid" }],
	add_items: [
		{ feature_id: "credits", included: 1000, reset: { interval: "month" } },
	],
};
const evidence = { facts: { listPlans: { list: [plan] } }, details: [] };
const attach = (patch: unknown = customize): ToolCall => ({
	name: "attach",
	args: {
		request: { customer_id: "customer", plan_id: "pro", customize: patch },
	},
});
const update = (extra: Record<string, unknown> = {}): ToolCall => ({
	name: "updateSubscription",
	args: {
		request: { customer_id: "customer", plan_id: "pro", customize, ...extra },
	},
});
const customer = (subscriptions: unknown[]) => ({
	name: "getCustomer",
	args: { request: { customer_id: "customer" } },
	result: { id: "customer", subscriptions },
});

test("effective plan evidence retains inherited features without requiring redundant additions", () => {
	const input = structuredClone({
		evidence,
		actions: [attach({ price: { amount: 49, interval: "month" } })],
	});
	const original = structuredClone(input);
	expect(buildEffectivePlanEvidence(input)).toMatchObject([
		{
			actionIndex: 0,
			planId: "pro",
			sourceKnown: true,
			price: { amount: 49 },
			items: expect.arrayContaining([
				expect.objectContaining({ feature_id: "history", unlimited: true }),
			]),
		},
	]);
	expect(input).toEqual(original);
	expect(
		buildEffectivePlanEvidence({ evidence: {}, actions: [attach()] }),
	).toEqual([{ actionIndex: 0, planId: "pro", sourceKnown: false }]);
});

test("reports the removed prepaid slot rather than the surviving usage-based slot", () => {
	const losses = detectPricedAllowanceRemovals({
		evidence,
		actions: [attach()],
	});
	expect(losses).toEqual([
		{
			actionIndex: 0,
			planId: "pro",
			featureId: "credits",
			billingMethod: "prepaid",
			sourceItem: prepaid,
			replacementItems: customize.add_items,
		},
	]);
});

test("leaves supplied evidence and request untouched and returns detached findings", () => {
	const input = structuredClone({ evidence, actions: [attach()] });
	const before = structuredClone(input);
	const losses = detectPricedAllowanceRemovals(input);
	expect(input).toEqual(before);
	losses[0].sourceItem.included = 99999;
	losses[0].replacementItems[0].included = 99999;
	expect(input).toEqual(before);
});

test("does not flag boolean removal, whole-plan cancellation, or allowance-only additions", () => {
	const actions = [
		attach({ remove_items: [{ feature_id: "history" }] }),
		attach({ add_items: customize.add_items }),
		update({ cancel_action: "cancel_immediately" }),
	];
	expect(detectPricedAllowanceRemovals({ evidence, actions })).toEqual([]);
});

test("does not treat explicit paid conversions as accidentally omitted prices", () => {
	const converted = {
		...customize,
		add_items: [
			{
				...customize.add_items[0],
				price: {
					amount: 0.2,
					interval: "month",
					billing_method: "usage_based",
				},
			},
		],
	};
	expect(
		detectPricedAllowanceRemovals({ evidence, actions: [attach(converted)] }),
	).toEqual([]);
	const preserved = {
		...customize,
		add_items: [{ ...customize.add_items[0], price: prepaid.price }],
	};
	expect(
		detectPricedAllowanceRemovals({ evidence, actions: [attach(preserved)] }),
	).toEqual([]);
});

test("detects PUT-style price loss and explicit null prices without treating either as authorization", () => {
	expect(
		detectPricedAllowanceRemovals({
			evidence,
			actions: [
				attach({ items: [{ ...customize.add_items[0], price: null }] }),
			],
		}).map((loss) => loss.billingMethod),
	).toEqual(["prepaid", "usage_based"]);
});

test("uses expanded subscription terms for updates rather than catalog pricing", () => {
	const customItem = {
		...prepaid,
		price: {
			...prepaid.price,
			tiers: [{ to: "inf", amount: 0, flat_amount: 77 }],
		},
	};
	const actual = { ...plan, items: [customItem] };
	const details = [
		customer([
			{
				id: "subscription",
				plan_id: "pro",
				status: "active",
				scope: "customer",
				plan: actual,
			},
		]),
	];
	const losses = detectPricedAllowanceRemovals({
		evidence: { ...evidence, details },
		actions: [update()],
	});
	expect(losses[0].sourceItem).toEqual(customItem);
	expect(
		detectPricedAllowanceRemovals({
			evidence: {
				...evidence,
				details: [
					customer([
						{
							id: "subscription",
							plan_id: "pro",
							plan: { ...plan, items: [] },
						},
					]),
				],
			},
			actions: [update()],
		}),
	).toEqual([]);
});

test("does not invent source terms when subscription expansion or unambiguous selection is missing", () => {
	expect(
		detectPricedAllowanceRemovals({ evidence, actions: [update()] }),
	).toEqual([]);
	expect(
		detectPricedAllowanceRemovals({
			evidence: {
				...evidence,
				details: [customer([{ id: "a", plan_id: "pro" }])],
			},
			actions: [update()],
		}),
	).toEqual([]);
	const details = [
		customer([
			{ id: "a", plan_id: "pro", plan },
			{ id: "b", plan_id: "pro", plan },
		]),
	];
	expect(
		detectPricedAllowanceRemovals({
			evidence: { ...evidence, details },
			actions: [update()],
		}),
	).toEqual([]);
	expect(
		detectPricedAllowanceRemovals({
			evidence: { ...evidence, details },
			actions: [update({ subscription_id: "b" })],
		}),
	).toHaveLength(1);
});

test("resolves entity subscriptions only within the requested customer's scope", () => {
	const entity = {
		name: "getEntity",
		args: { request: { customer_id: "customer", entity_id: "workspace" } },
		result: {
			id: "workspace",
			subscriptions: [
				{ id: "entity-sub", plan_id: "pro", scope: "entity", plan },
			],
		},
	};
	const details = [
		customer([
			{ id: "customer-sub", plan_id: "pro", plan: { ...plan, items: [] } },
		]),
		entity,
	];
	expect(
		detectPricedAllowanceRemovals({
			evidence: { ...evidence, details },
			actions: [update({ entity_id: "workspace" })],
		}),
	).toHaveLength(1);
	expect(
		detectPricedAllowanceRemovals({
			evidence: { ...evidence, details },
			actions: [update()],
		}),
	).toEqual([]);
	const wrongOwner = {
		...entity,
		args: { request: { customer_id: "other", entity_id: "workspace" } },
	};
	expect(
		detectPricedAllowanceRemovals({
			evidence: { ...evidence, details: [wrongOwner] },
			actions: [update({ entity_id: "workspace" })],
		}),
	).toEqual([]);
});

test("selects explicit catalog versions and skips ambiguous or missing catalog state", () => {
	const versioned = {
		facts: { listPlans: { list: [plan, { ...plan, version: 2, items: [] }] } },
	};
	expect(
		detectPricedAllowanceRemovals({ evidence: versioned, actions: [attach()] }),
	).toEqual([]);
	const selected = attach();
	(selected.args.request as Record<string, unknown>).version = 1;
	expect(
		detectPricedAllowanceRemovals({ evidence: versioned, actions: [selected] }),
	).toHaveLength(1);
	expect(
		detectPricedAllowanceRemovals({ evidence: {}, actions: [attach()] }),
	).toEqual([]);
});

test("checks each scheduled plan and retains the enclosing action index", () => {
	const schedule: ToolCall = {
		name: "createSchedule",
		args: {
			request: {
				customer_id: "customer",
				phases: [
					{ starts_at: 1800000000000, plans: [{ plan_id: "pro", customize }] },
					{ starts_at: 1831536000000, plans: [{ plan_id: "pro" }] },
				],
			},
		},
	};
	const losses = detectPricedAllowanceRemovals({
		evidence,
		actions: [{ name: "updateCustomer", args: { request: {} } }, schedule],
	});
	expect(losses).toHaveLength(1);
	expect(losses[0].actionIndex).toBe(1);
});

test("respects cadence-specific removal filters", () => {
	const yearly = {
		...prepaid,
		price: { ...prepaid.price, interval: "year" },
		reset: { interval: "year" },
	};
	const catalog = {
		facts: { listPlans: { list: [{ ...plan, items: [prepaid, yearly] }] } },
	};
	const patch = {
		...customize,
		remove_items: [
			{ feature_id: "credits", billing_method: "prepaid", interval: "year" },
		],
	};
	const losses = detectPricedAllowanceRemovals({
		evidence: catalog,
		actions: [attach(patch)],
	});
	expect(losses).toHaveLength(1);
	expect(losses[0].sourceItem).toEqual(yearly);
});

test("another surviving paid item in the same slot does not hide a removed price", () => {
	const other = { ...prepaid, included: 500 };
	const catalog = {
		facts: { listPlans: { list: [{ ...plan, items: [prepaid, other] }] } },
	};
	const patch = {
		...customize,
		remove_items: [
			{ feature_id: "credits", billing_method: "prepaid", included: 100 },
		],
	};
	const losses = detectPricedAllowanceRemovals({
		evidence: catalog,
		actions: [attach(patch)],
	});
	expect(losses).toHaveLength(1);
	expect(losses[0].sourceItem).toEqual(prepaid);
});

test("does not infer current update terms from scheduled subscriptions or version switches", () => {
	const scheduled = [
		customer([
			{ id: "subscription", plan_id: "pro", status: "scheduled", plan },
		]),
	];
	expect(
		detectPricedAllowanceRemovals({
			evidence: { ...evidence, details: scheduled },
			actions: [update()],
		}),
	).toEqual([]);
	const active = [
		customer([{ id: "subscription", plan_id: "pro", status: "active", plan }]),
	];
	expect(
		detectPricedAllowanceRemovals({
			evidence: { ...evidence, details: active },
			actions: [update({ version: 2 })],
		}),
	).toEqual([]);
});

test("existing tier helpers preserve the paid ladder by moving through internal coordinates", () => {
	const tiers = [
		{ to: 200, amount: 0, flat_amount: 20 },
		{ to: 300, amount: 0, flat_amount: 30 },
		{ to: "inf" as const, amount: 0, flat_amount: 40 },
	];
	const internal = subtractIncludedFromTiers({ tiers, included: 100 });
	const rebased = addIncludedToTiers({ tiers: internal, included: 1000 });
	expect(rebased.map((tier) => tier.to)).toEqual([1100, 1200, "inf"]);
	expect(rebased.map((tier) => tier.flat_amount)).toEqual([20, 30, 40]);
	expect(subtractIncludedFromTiers({ tiers: rebased, included: 1000 })).toEqual(
		internal,
	);
	expect(tiers[0].to).toBe(200);
});

test("guidance rebases the prepaid ladder and includes only supplied business fields", () => {
	const sourceItem = {
		feature_id: "credits",
		included: 1000,
		pooled: false,
		display: { primary_text: "Credits" },
		entitlement_id: "internal-ent",
		price_id: "internal-price",
		entity_feature_id: "internal-feature",
		reset: { interval: "month" },
		rollover: {
			max: null,
			max_percentage: 50,
			expiry_duration_type: "month",
			expiry_duration_length: 1,
		},
		price: {
			billing_method: "prepaid",
			interval: "month",
			tier_behavior: "volume",
			stripe_price_id: "internal-stripe",
			processors: { stripe: {} },
			display: { primary_text: "Prepaid" },
			tiers: [
				{ to: 2000, flat_amount: 200 },
				{ to: 3500, flat_amount: 300 },
				{ to: 5000, flat_amount: 400 },
				{ to: 7000, flat_amount: 500 },
				{ to: "inf", flat_amount: 600 },
			],
		},
	};
	const losses = [
		{
			actionIndex: 0,
			planId: "pro",
			featureId: "credits",
			billingMethod: "prepaid",
			sourceItem,
			replacementItems: [
				{
					feature_id: "credits",
					included: 100000,
					pooled: false,
					reset: { interval: "month" },
				},
			],
		},
	];
	const before = structuredClone(losses);
	const guidance = buildPricedAllowanceRepairGuidance({ losses });
	expect(guidance[0].status).toBe("repair");
	expect(guidance[0].replacementItem).toEqual({
		feature_id: "credits",
		included: 100000,
		reset: { interval: "month" },
		rollover: {
			max_percentage: 50,
			expiry_duration_type: "month",
			expiry_duration_length: 1,
		},
		price: {
			billing_method: "prepaid",
			interval: "month",
			tier_behavior: "volume",
			tiers: [
				{ to: 101000, flat_amount: 200 },
				{ to: 102500, flat_amount: 300 },
				{ to: 104000, flat_amount: 400 },
				{ to: 106000, flat_amount: 500 },
				{ to: "inf", flat_amount: 600 },
			],
		},
	});
	expect(guidance[0].message).toContain(
		"normal validation, preview, and approval",
	);
	expect(losses).toEqual(before);
});

test("guidance preserves a flat paid rate and supplied business controls without inventing tiers", () => {
	const sourceItem = {
		feature_id: "credits",
		included: 100,
		price: {
			billing_method: "usage_based",
			amount: 0.1,
			interval: "month",
			billing_units: 100,
		},
		reset: { interval: "month" },
		threshold_billing: { threshold: 1000 },
	};
	const guidance = buildPricedAllowanceRepairGuidance({
		losses: [
			{
				actionIndex: 2,
				planId: "pro",
				featureId: "credits",
				billingMethod: "usage_based",
				sourceItem,
				replacementItems: [{ feature_id: "credits", included: 1000 }],
			},
		],
	});
	expect(guidance[0].replacementItem).toEqual({
		...sourceItem,
		included: 1000,
	});
	expect(guidance[0].actionIndex).toBe(2);
});

test("ambiguous, unlimited or changed ancillary terms require clarification instead of a guessed replacement", () => {
	const base = detectPricedAllowanceRemovals({
		evidence,
		actions: [attach()],
	})[0];
	for (const replacementItems of [
		[],
		[...base.replacementItems, ...base.replacementItems],
		[{ feature_id: "credits", unlimited: true }],
		[{ feature_id: "credits", included: 1000, reset: { interval: "year" } }],
	]) {
		const guidance = buildPricedAllowanceRepairGuidance({
			losses: [{ ...base, replacementItems }],
		});
		expect(guidance[0].status).toBe("clarify");
		expect(guidance[0].replacementItem).toBeUndefined();
	}
	expect(
		buildPricedAllowanceRepairGuidance({ losses: [base, base] }).every(
			(entry) => entry.status === "clarify",
		),
	).toBe(true);
});

test("guidance refuses unknown or invalid source pricing rather than fabricating paid terms", () => {
	const base = detectPricedAllowanceRemovals({
		evidence,
		actions: [attach()],
	})[0];
	for (const sourceItem of [
		{ ...base.sourceItem, included: undefined },
		{ ...base.sourceItem, price: null },
		{
			...base.sourceItem,
			price: {
				...prepaid.price,
				tiers: [{ to: 50, amount: 0, flat_amount: 20 }],
			},
		},
	]) {
		const guidance = buildPricedAllowanceRepairGuidance({
			losses: [{ ...base, sourceItem }],
		});
		expect(guidance[0].status).toBe("clarify");
		expect(guidance[0].replacementItem).toBeUndefined();
	}
});

const repairedAllowance = () => {
	const losses = detectPricedAllowanceRemovals({
		evidence,
		actions: [attach()],
	});
	const replacementItem = buildPricedAllowanceRepairGuidance({ losses })[0]
		.replacementItem;
	if (!replacementItem) throw new Error("Missing valid test repair");
	return attach({ ...customize, add_items: [replacementItem] });
};

test("paid-coordinate evidence proves rebased tiers preserve prices without authorizing the allowance change", () => {
	const actions = [repairedAllowance()];
	const before = structuredClone({ evidence, actions });
	const comparisons = buildPricedAllowanceEquivalenceEvidence({
		evidence,
		actions,
	});
	expect(comparisons).toHaveLength(1);
	expect(comparisons[0]).toMatchObject({
		actionIndex: 0,
		planId: "pro",
		featureId: "credits",
		sourceIncluded: 100,
		proposedIncluded: 1000,
		paidPricePreserved: true,
	});
	expect(comparisons[0].sourcePaidPrice).toEqual(
		comparisons[0].proposedPaidPrice,
	);
	expect(comparisons[0].sourcePaidPrice.tiers).toEqual([
		{ to: 100, amount: 0, flat_amount: 20 },
		{ to: "inf", amount: 0, flat_amount: 30 },
	]);
	expect({ evidence, actions }).toEqual(before);
	expect(comparisons[0]).not.toHaveProperty("authorized");
});

test.each([
	{
		label: "flat tier charge",
		patch: {
			tiers: [
				{ to: 1100, amount: 0, flat_amount: 21 },
				{ to: "inf", amount: 0, flat_amount: 30 },
			],
		},
	},
	{
		label: "paid tier boundary",
		patch: {
			tiers: [
				{ to: 1200, amount: 0, flat_amount: 20 },
				{ to: "inf", amount: 0, flat_amount: 30 },
			],
		},
	},
	{
		label: "billing method",
		patch: {
			billing_method: "usage_based",
			tier_behavior: "graduated",
			tiers: [
				{ to: 1100, amount: 0.1 },
				{ to: "inf", amount: 0.2 },
			],
		},
	},
	{ label: "billing cadence", patch: { interval: "year" } },
	{ label: "billing interval count", patch: { interval_count: 2 } },
	{ label: "billing units", patch: { billing_units: 100 } },
	{ label: "purchase limit", patch: { max_purchase: 100 } },
	{
		label: "tier behavior",
		patch: {
			tier_behavior: "graduated",
			tiers: [
				{ to: 1100, amount: 0.1 },
				{ to: "inf", amount: 0.2 },
			],
		},
	},
])(
	"paid-coordinate evidence does not call a changed $label preserved",
	({ patch }) => {
		const call = repairedAllowance();
		const request = call.args.request as {
			customize: { add_items: Array<{ price: Record<string, unknown> }> };
		};
		Object.assign(request.customize.add_items[0].price, patch);
		const comparisons = buildPricedAllowanceEquivalenceEvidence({
			evidence,
			actions: [call],
		});
		expect(comparisons).toHaveLength(1);
		expect(comparisons[0].paidPricePreserved).toBe(false);
	},
);

test("evidence ignores real display/internal fields and normalizes supported defaults", () => {
	const enriched = {
		...prepaid,
		display: { primary_text: "Display only" },
		price_id: "source-id",
		price: {
			...prepaid.price,
			display: { primary_text: "Source price" },
			stripe_price_id: "stripe-source",
			processors: { stripe: {} },
			max_purchase: null,
		},
	};
	const source = {
		facts: { listPlans: { list: [{ ...plan, items: [enriched] }] } },
	};
	const call = repairedAllowance();
	const request = call.args.request as {
		customize: { add_items: Array<{ price: Record<string, unknown> }> };
	};
	Object.assign(request.customize.add_items[0].price, {
		interval_count: 1,
		billing_units: 1,
		stripe_price_id: "stripe-new",
	});
	const comparisons = buildPricedAllowanceEquivalenceEvidence({
		evidence: source,
		actions: [call],
	});
	expect(comparisons[0].paidPricePreserved).toBe(true);
	expect(comparisons[0].sourcePaidPrice).not.toHaveProperty("stripe_price_id");
	expect(comparisons[0].sourcePaidPrice).not.toHaveProperty("display");
	expect(comparisons[0].sourcePaidPrice).not.toHaveProperty("processors");
});

test("evidence does not certify ambiguous or unavailable source pricing", () => {
	expect(
		buildPricedAllowanceEquivalenceEvidence({
			evidence: {},
			actions: [repairedAllowance()],
		}),
	).toEqual([]);
	const call = repairedAllowance();
	call.name = "updateSubscription";
	expect(
		buildPricedAllowanceEquivalenceEvidence({ evidence, actions: [call] }),
	).toEqual([]);
	const request = call.args.request as { customize: { add_items: unknown[] } };
	call.name = "attach";
	request.customize.add_items.push(
		structuredClone(request.customize.add_items[0]),
	);
	expect(
		buildPricedAllowanceEquivalenceEvidence({ evidence, actions: [call] }),
	).toEqual([]);
});

test("independent schedule phases get distinct guidance and economic equivalence evidence", () => {
	const schedule: ToolCall = {
		name: "createSchedule",
		args: {
			request: {
				customer_id: "customer",
				phases: [1000, 2000, 3000, 4000].map((included, index) => ({
					starts_at: 1800000000000 + index * 31536000000,
					plans: [
						{
							plan_id: "pro",
							customize: {
								...customize,
								add_items: [{ ...customize.add_items[0], included }],
							},
						},
					],
				})),
			},
		},
	};
	const losses = detectPricedAllowanceRemovals({
		evidence,
		actions: [schedule],
	});
	expect(losses.map((loss) => loss.phaseIndex)).toEqual([0, 1, 2, 3]);
	const guidance = buildPricedAllowanceRepairGuidance({ losses });
	expect(guidance.map((entry) => entry.status)).toEqual([
		"repair",
		"repair",
		"repair",
		"repair",
	]);
	expect(guidance.map((entry) => entry.phaseIndex)).toEqual([0, 1, 2, 3]);
	const request = schedule.args.request as {
		phases: Array<{ plans: Array<{ customize: { add_items: unknown[] } }> }>;
	};
	for (const entry of guidance) {
		if (entry.phaseIndex === undefined)
			throw new Error("Missing schedule phase index");
		request.phases[entry.phaseIndex].plans[0].customize.add_items = [
			entry.replacementItem,
		];
	}
	const comparisons = buildPricedAllowanceEquivalenceEvidence({
		evidence,
		actions: [schedule],
	});
	expect(
		comparisons.map((entry) => [entry.phaseIndex, entry.paidPricePreserved]),
	).toEqual([
		[0, true],
		[1, true],
		[2, true],
		[3, true],
	]);
	const ambiguous = buildPricedAllowanceRepairGuidance({
		losses: [...losses, losses[0]],
	});
	expect(
		ambiguous
			.filter((entry) => entry.phaseIndex === 0)
			.every((entry) => entry.status === "clarify"),
	).toBe(true);
	expect(
		ambiguous
			.filter((entry) => entry.phaseIndex !== 0)
			.every((entry) => entry.status === "repair"),
	).toBe(true);
});
