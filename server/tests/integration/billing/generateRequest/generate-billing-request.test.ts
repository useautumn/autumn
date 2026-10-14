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

		const res = await autumnV2_2.post(GENERATE_PATH, {
			tool: "attach",
			prompt: "Attach the pro plan with a 14 day free trial",
			customer_id: customerId,
		});

		expect(res.object).toBe("billing_request_generation");
		expect(res.tool).toBe("attach");
		expect(Array.isArray(res.unrepresentable)).toBe(true);
		expect(res.unrepresentable).toEqual([]);

		expect(res.request.product_id).toBe(`pro_${customerId}`);
		expect(res.request.free_trial.length).toBe(14);
		expect(res.request.free_trial.duration).toBe("day");

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

		expect(res.request.options).toEqual([
			expect.objectContaining({ feature_id: "messages", quantity: 500 }),
		]);

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

		const requestItems = res.request.items as
			| { feature_id?: string; included_usage?: number; price?: number }[]
			| undefined;
		expect(Array.isArray(requestItems)).toBe(true);

		const messagesItem = requestItems?.find(
			(item) => item.feature_id === "messages",
		);
		expect(messagesItem?.included_usage).toBe(500);

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

		expect(res.request.cancel_action).toBe("cancel_end_of_cycle");

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

		await expect(
			autumnV2_2.post(GENERATE_PATH, {
				tool: "delete_everything",
				prompt: "Attach the pro plan",
				customer_id: customerId,
			}),
		).rejects.toThrow();

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
