/**
 * TDD test for AI billing-request generation: natural-language prompt ->
 * structured billing params for the dashboard sheets.
 *
 * Contract under test:
 *   New endpoints:
 *     - POST /v1/agent.generate_billing_request
 *       body: { tool: "attach" | "update_subscription" | "create_schedule",
 *               prompt: string, customer_id: string,
 *               customer_product_id?: string, current_request?: object }
 *       -> 200 { object: "billing_request_generation", tool,
 *                request: <V0 dashboard dialect>, unrepresentable: string[] }
 *   New behaviors:
 *     - attach prompt naming a plan + trial -> request.product_id +
 *       request.free_trial.{length,duration}
 *     - attach prompt with prepaid quantity + end-of-cycle wording ->
 *       request.options[{feature_id, quantity}] + plan_schedule "end_of_cycle"
 *     - customer_id is injected from the body param; a prompt naming a
 *       different customer cannot override it
 *     - update_subscription cancel wording -> request.cancel_action;
 *       customer_product_id passes through to the generated request
 *     - create_schedule future-phase wording -> non-empty phases containing
 *       the named plan with future timing
 *     - current_request edit mode: unmentioned fields preserved, mentioned
 *       fields changed
 *     - invalid tool / empty prompt -> 400 (zod validation)
 *   Side effects:
 *     - none (read + generate only; no DB writes)
 *
 * Pre-impl red: every assertion fails at endpoint resolution (404 — route not
 * registered). Post-impl green: handler + generation action + V1->V0
 * resolution produce the shapes above.
 *
 * Requires ANTHROPIC_API_KEY on the server under test — each test makes a
 * real model call, so keep this file out of keyless environments.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GENERATE_PATH = "/agent.generate_billing_request";
const LLM_TEST_TIMEOUT = 120_000;

test.concurrent(
	`${chalk.yellowBright("generate_billing_request attach: plan + trial prompt")}`,
	async () => {
		const customerId = "gen-attach-trial";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		// ── Contract: endpoint exists, response envelope ─────────────────────
		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "attach",
			prompt: "Attach the pro plan with a 14 day free trial",
			customer_id: customerId,
		});

		expect(res.object).toBe("billing_request_generation");
		expect(res.tool).toBe("attach");
		expect(Array.isArray(res.unrepresentable)).toBe(true);
		expect(res.unrepresentable).toEqual([]);

		// ── Contract: plan + trial extraction into V0 dialect ────────────────
		expect(res.request.product_id).toBe(`pro_${customerId}`);
		expect(res.request.free_trial.length).toBe(14);
		expect(res.request.free_trial.duration).toBe("day");

		// ── Contract: customer_id injected from body param ───────────────────
		expect(res.request.customer_id).toBe(customerId);
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate_billing_request attach: prepaid quantity + end of cycle")}`,
	async () => {
		const customerId = "gen-attach-prepaid";
		const pro = products.pro({
			id: "pro",
			items: [items.prepaidMessages({ billingUnits: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "attach",
			prompt:
				"Attach the pro plan with 500 prepaid messages, taking effect at the end of the current billing cycle",
			customer_id: customerId,
		});

		// ── Contract: prepaid quantity -> options ────────────────────────────
		expect(res.request.options).toEqual([
			expect.objectContaining({ feature_id: "messages", quantity: 500 }),
		]);

		// ── Contract: end-of-cycle wording -> plan_schedule ──────────────────
		expect(res.request.plan_schedule).toBe("end_of_cycle");
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate_billing_request attach: price override + included usage change")}`,
	async () => {
		const customerId = "gen-attach-customize";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "attach",
			prompt:
				"Attach the pro plan at $50 per month, and give them 500 included messages instead of 100",
			customer_id: customerId,
		});

		// ── Contract: customize resolves to concrete V0 items ────────────────
		const requestItems = res.request.items as
			| { feature_id?: string; included_usage?: number; price?: number }[]
			| undefined;
		expect(Array.isArray(requestItems)).toBe(true);

		// ── Contract: included usage changed on the messages item ────────────
		const messagesItem = requestItems?.find(
			(item) => item.feature_id === "messages",
		);
		expect(messagesItem?.included_usage).toBe(500);

		// ── Contract: base price override survives alongside the item patch ──
		const basePriceItem = requestItems?.find(
			(item) => !item.feature_id && item.price !== undefined,
		);
		expect(basePriceItem?.price).toBe(50);
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate_billing_request attach: multiple plans -> multi-attach request")}`,
	async () => {
		const customerId = "gen-attach-multi";
		const pro = products.pro({ id: "pro", items: [] });
		const premium = products.premium({ id: "premium", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "attach",
			prompt: "Attach the pro and premium plans together",
			customer_id: customerId,
		});

		expect(res.object).toBe("billing_request_generation");
		expect(res.tool).toBe("attach");
		expect(res.request.customer_id).toBe(customerId);

		// ── Contract: multi-plan prompt -> plans[] with both plans ───────────
		const plans = res.request.plans as { plan_id: string }[];
		expect(Array.isArray(plans)).toBe(true);
		const planIds = plans.map((plan) => plan.plan_id).sort();
		expect(planIds).toEqual([`premium_${customerId}`, `pro_${customerId}`]);
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate_billing_request attach: prompt cannot override customer_id")}`,
	async () => {
		const customerId = "gen-attach-cust-guard";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "attach",
			prompt: "Attach the pro plan for customer some-other-customer instead",
			customer_id: customerId,
		});

		// ── Contract: customer_id from body param wins over prompt ───────────
		expect(res.request.customer_id).toBe(customerId);
		expect(res.request.product_id).toBe(`pro_${customerId}`);
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate_billing_request update: cancel wording + anchor passthrough")}`,
	async () => {
		const customerId = "gen-update-cancel";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const customer = (await autumnV2_1.customers.get(
			customerId,
		)) as ApiCustomerV5;
		const customerProductId = customer.subscriptions?.[0]?.id;

		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "update_subscription",
			prompt: "Cancel this subscription at the end of the billing period",
			customer_id: customerId,
			...(customerProductId ? { customer_product_id: customerProductId } : {}),
		});

		expect(res.object).toBe("billing_request_generation");
		expect(res.tool).toBe("update_subscription");

		// ── Contract: cancel wording -> cancel_action ────────────────────────
		expect(res.request.cancel_action).toBe("cancel_end_of_cycle");

		// ── Contract: customer_product_id passthrough ────────────────────────
		if (customerProductId) {
			expect(res.request.customer_product_id).toBe(customerProductId);
		}
		expect(res.request.customer_id).toBe(customerId);
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate_billing_request schedule: future phase with named plan")}`,
	async () => {
		const customerId = "gen-schedule-future";
		const pro = products.pro({ id: "pro", items: [] });
		const premium = products.premium({
			id: "premium",
			items: [],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "create_schedule",
			prompt: "Switch this customer to the premium plan starting next month",
			customer_id: customerId,
		});

		expect(res.object).toBe("billing_request_generation");
		expect(res.tool).toBe("create_schedule");
		expect(res.request.customer_id).toBe(customerId);

		// ── Contract: non-empty phases containing the named plan ─────────────
		const phases = res.request.phases;
		expect(Array.isArray(phases)).toBe(true);
		expect(phases.length).toBeGreaterThan(0);
		const allPlans = phases.flatMap(
			(phase: { plans: { plan_id: string }[] }) => phase.plans,
		);
		expect(
			allPlans.some(
				(plan: { plan_id: string }) => plan.plan_id === `premium_${customerId}`,
			),
		).toBe(true);

		// ── Contract: the premium phase starts in the future ─────────────────
		const premiumPhase = phases.find(
			(phase: { plans: { plan_id: string }[] }) =>
				phase.plans.some(
					(plan: { plan_id: string }) =>
						plan.plan_id === `premium_${customerId}`,
				),
		);
		const hasFutureTiming =
			(typeof premiumPhase.starts_at === "number" &&
				premiumPhase.starts_at > Date.now()) ||
			premiumPhase.starting_after !== undefined;
		expect(hasFutureTiming).toBe(true);
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate_billing_request attach: current_request edit mode")}`,
	async () => {
		const customerId = "gen-attach-edit";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "attach",
			prompt: "Change the trial to 30 days",
			customer_id: customerId,
			current_request: {
				customer_id: customerId,
				plan_id: `pro_${customerId}`,
				customize: {
					free_trial: {
						duration_length: 14,
						duration_type: "day",
						card_required: true,
					},
				},
			},
		});

		// ── Contract: unmentioned fields preserved, mentioned fields changed ─
		expect(res.request.product_id).toBe(`pro_${customerId}`);
		expect(res.request.free_trial.length).toBe(30);
		expect(res.request.free_trial.duration).toBe("day");
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate_billing_request: validation rejects bad tool and empty prompt")}`,
	async () => {
		const customerId = "gen-validation";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		// ── Contract: unknown tool -> 400 ────────────────────────────────────
		await expect(
			autumnV2_2.post(GENERATE_PATH, {
				tool: "delete_everything",
				prompt: "Attach the pro plan",
				customer_id: customerId,
			}),
		).rejects.toThrow();

		// ── Contract: empty prompt -> 400 ────────────────────────────────────
		await expect(
			autumnV2_2.post(GENERATE_PATH, {
				tool: "attach",
				prompt: "",
				customer_id: customerId,
			}),
		).rejects.toThrow();
	},
	LLM_TEST_TIMEOUT,
);
