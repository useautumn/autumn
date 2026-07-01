/**
 * TDD (feature) test for `POST /v1/dfu.flash` — customer imaging / live migration.
 * Grounded in anonymized GalaxyAI migration scenarios. Read-only against processors.
 *
 * Contract under test:
 *   New endpoint:
 *     - POST /v1/dfu.flash -> { customer_id, flashed: [{ plan_id, processor,
 *         customer_product_id, status, skipped, reason? }] }
 *   New request schema (DfuFlashParamsSchema):
 *     - customer_id (req), customer_data?, processors[], billables[], entities?(internal), dry_run?
 *     - billable: { processor: stripe|revenuecat|vercel(internal)|none, link?, billing_cycle_anchor?, phases[] }
 *     - plan: { plan_id, version?, status?(active|trialing|past_due|canceled|expired),
 *         quantity?, feature_quantities?, customize?(internal), balances[] }
 *     - balance: { feature_id, filter?{interval?,billing_behavior?}, usage?, balance?, next_reset_at?, rollover?(internal) }
 *   New behaviors:
 *     1. Route resolves (not 404).
 *     2. A full v1 payload validates (no 400).
 *     3. Stripe recurring plan (subscription_id) -> active cusProduct, mid-cycle usage
 *        applied (balance = allowance - usage).
 *     4. RC one-off plan (processor=revenuecat, no link) -> cusProduct tagged revenuecat;
 *        a multi-line credits feature gets per-line usage via `filter` (monthly + one-off).
 *     5. Cross-processor: same add-on plan on Stripe AND RC, each with NON-ZERO prepaid
 *        balance -> both cusProducts present with correct (non-zero) balances.
 *     6. Expired plan (status=expired) -> cusProduct status=expired AND no feature access
 *        (the access-leak regression).
 *     7. Re-flash same payload -> existing active cusProducts skipped (flashed[].skipped=true),
 *        nothing deleted/duplicated.
 *     8. Docs: entities / starting_after / vercel marked internal (schema-level note).
 *
 * Pre-impl red: `flash` action is a STUB that throws not_implemented (501), so behavior
 *   assertions 3-7 fail (nothing inserted). Route + validation (1, 2) already pass.
 * Post-impl green: all pass once the flash action inserts cusProducts + balances.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	CusProductStatus,
	type DfuFlashResult,
	type FullCusProduct,
	ResetInterval,
} from "@autumn/shared";
import {
	createStripeSubscriptionFromProduct,
	getAllStripePriceIds,
} from "@tests/integration/billing/sync/utils/syncTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

const getFlashedCustomerProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}): Promise<FullCusProduct | undefined> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [
			CusProductStatus.Active,
			CusProductStatus.PastDue,
			CusProductStatus.Scheduled,
			CusProductStatus.Expired,
		],
		withEntities: true,
	});
	return fullCustomer.customer_products.find(
		(product) => product.product_id === productId,
	);
};

type FlashClient = {
	post: (path: string, body: unknown) => Promise<unknown>;
};

const callFlash = async (
	client: FlashClient,
	body: unknown,
): Promise<{
	result: DfuFlashResult | null;
	errorCode: string | null;
	errorMessage: string | null;
}> => {
	try {
		const result = (await client.post("/dfu.flash", body)) as DfuFlashResult;
		return { result, errorCode: null, errorMessage: null };
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return {
			result: null,
			errorCode: e.code ?? null,
			errorMessage: e.message ?? null,
		};
	}
};

// ── Scenario A: route + validation + Stripe recurring mid-cycle usage (contract 1,2,3) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: Stripe recurring plan applies mid-cycle usage")}`,
	async () => {
		const customerId = "dfu-flash-stripe-recurring";
		const pro = products.pro({
			id: "dfu-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: "cus_stripe_dfu_a" }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: "sub_dfu_a" },
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: pro.id,
									status: "active",
									balances: [{ feature_id: TestFeature.Messages, usage: 40 }],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 1: route resolves (not 404). Green now (stub 501) & post-impl (200). ──
		expect(flashRes.errorCode).not.toBe("not_found");
		expect(flashRes.errorMessage ?? "").not.toContain("status 404");

		// ── Contract 2: full v1 payload validates (no 400 / zod reject). ──
		expect(flashRes.errorCode).not.toBe("invalid_request");
		expect(flashRes.errorCode).not.toBe("invalid_inputs");

		// ── Contract 3: active cusProduct inserted; balance = allowance - usage. ──
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 60,
			usage: 40,
		});
	},
);

// ── Scenario B: RC one-off, multi-line credits with per-line usage (contract 4) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: RevenueCat one-off with multi-line credits usage")}`,
	async () => {
		const customerId = "dfu-flash-rc-multiline";
		const lifetimePlan = products.base({
			id: "dfu-rc-lifetime",
			isAddOn: true,
			items: [
				items.monthlyCredits({ includedUsage: 15 }),
				constructFeatureItem({
					featureId: TestFeature.Credits,
					includedUsage: 100,
					interval: null,
				}),
			],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [lifetimePlan] }),
			],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			processors: [],
			billables: [
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: lifetimePlan.id,
									status: "active",
									balances: [
										{
											feature_id: TestFeature.Credits,
											filter: {
												interval: "month",
												billing_behavior: "included",
											},
											usage: 5,
										},
										{
											feature_id: TestFeature.Credits,
											filter: { interval: null },
											usage: 10,
										},
									],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 4a: cusProduct present and tagged revenuecat. ──
		const flashed = flashRes.result?.flashed?.find(
			(f) => f.plan_id === lifetimePlan.id,
		);
		expect(flashed?.processor).toBe("revenuecat");

		// ── Contract 4b: each credits line gets its own usage (filter-matched). ──
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [lifetimePlan.id] });
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Credits,
			granted: 115,
			remaining: 100,
			usage: 15,
			breakdown: {
				[ResetInterval.Month]: { remaining: 10, usage: 5 },
				[ResetInterval.OneOff]: { remaining: 90, usage: 10 },
			},
		});
	},
);

// ── Scenario C: cross-processor same add-on, both non-zero prepaid (contract 5) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: cross-processor add-on keeps both prepaid balances non-zero")}`,
	async () => {
		const customerId = "dfu-flash-cross-processor";
		const seatPack = products.base({
			id: "dfu-seat-pack",
			isAddOn: true,
			items: [items.prepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [seatPack] }),
			],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: "cus_stripe_dfu_c" }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: "sub_dfu_c_stripe" },
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: seatPack.id,
									status: "active",
									feature_quantities: [
										{ feature_id: TestFeature.Messages, quantity: 200 },
									],
									balances: [{ feature_id: TestFeature.Messages, usage: 50 }],
								},
							],
						},
					],
				},
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: seatPack.id,
									status: "active",
									feature_quantities: [
										{ feature_id: TestFeature.Messages, quantity: 300 },
									],
									balances: [{ feature_id: TestFeature.Messages, usage: 100 }],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 5: two cusProducts flashed, both non-zero balances. ──
		const stripeFlashed = flashRes.result?.flashed?.find(
			(f) => f.processor === "stripe" && f.plan_id === seatPack.id,
		);
		const rcFlashed = flashRes.result?.flashed?.find(
			(f) => f.processor === "revenuecat" && f.plan_id === seatPack.id,
		);
		expect(stripeFlashed?.customer_product_id).toBeTruthy();
		expect(rcFlashed?.customer_product_id).toBeTruthy();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		// Combined remaining: (200-50) + (300-100) = 350; regression = must not be 0.
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 350,
		});
	},
);

// ── Scenario D: expired plan, status expired AND no access (contract 6 — leak guard) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: expired plan is status=expired and grants no access")}`,
	async () => {
		const customerId = "dfu-flash-expired";
		const pro = products.pro({
			id: "dfu-expired-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: "cus_stripe_dfu_d" }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: "sub_dfu_d" },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "expired" }],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 6a: flashed status reported as expired. ──
		const flashed = flashRes.result?.flashed?.find((f) => f.plan_id === pro.id);
		expect(flashed?.status).toBe("expired");

		// ── Contract 6b: customer has NO access to the expired plan's feature. ──
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, notPresent: [pro.id] });
		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.remaining ?? 0).toBe(0);
	},
);

// ── Scenario E: re-flash is idempotent — existing active skipped (contract 7) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: re-flashing skips existing active cusProducts")}`,
	async () => {
		const customerId = "dfu-flash-reflash";
		const pro = products.pro({
			id: "dfu-reflash-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: "cus_stripe_dfu_e" }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: "sub_dfu_e" },
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: pro.id,
									status: "active",
									balances: [{ feature_id: TestFeature.Messages, usage: 25 }],
								},
							],
						},
					],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);
		const secondFlash = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 7a: second flash reports the existing product as skipped. ──
		const flashed = secondFlash.result?.flashed?.find(
			(f) => f.plan_id === pro.id,
		);
		expect(flashed?.skipped).toBe(true);

		// ── Contract 7b: nothing duplicated — single active product remains. ──
		const customerV5 =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer: customerV5, active: [pro.id] });
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const proInstances = (customerV3.products ?? []).filter(
			(p) => p.id === pro.id,
		);
		expect(proInstances.length).toBe(1);
	},
);

// ── Contract 8: internal fields (entities / starting_after / vercel) are accepted by the
// schema but marked .meta({ internal: true }) so docs hide them. Internal-ness is enforced
// at the OpenAPI layer (registerInternalSchemas); here we assert the schema still validates
// a payload carrying entities without a 400, proving the field is defined + optional. ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: internal entities field is accepted (docs hide it)")}`,
	async () => {
		const customerId = "dfu-flash-internal-fields";
		const pro = products.pro({
			id: "dfu-internal-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: "cus_stripe_dfu_f" }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: "sub_dfu_f" },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "active" }],
						},
					],
				},
			],
			entities: [
				{
					entity_id: "ws_A",
					feature_id: TestFeature.Users,
					billables: [
						{
							processor: "stripe",
							link: { subscription_id: "sub_dfu_f_entity" },
							phases: [
								{
									starts_at: "now",
									plans: [{ plan_id: pro.id, status: "active" }],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// Payload with internal `entities` must not be rejected as a bad request.
		expect(flashRes.errorCode).not.toBe("invalid_request");
		expect(flashRes.errorCode).not.toBe("invalid_inputs");
	},
);

// ══════════════════════════════════════════════════════════════════════════
// Stripe hydration layer — fill omitted fields from a real (read-only) sub.
// Each scenario creates a REAL Stripe subscription (not an Autumn attach), so
// the Autumn customer starts with zero cusProducts and flash inserts fresh.
// ══════════════════════════════════════════════════════════════════════════

// ── Hydration 1: omitted status/ended hydrated from a canceling sub ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: omitted status hydrated from canceling Stripe sub")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-status";
		const pro = products.pro({
			id: "dfu-hydrate-status-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const sub = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		await ctx.stripeCli.subscriptions.update(sub.id, {
			cancel_at_period_end: true,
		});

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		// Canceling-at-period-end: still active, canceled=true, ended_at in the future.
		expect(cusProduct?.status).toBe(CusProductStatus.Active);
		expect(cusProduct?.canceled).toBe(true);
		expect(cusProduct?.ended_at ?? 0).toBeGreaterThan(Date.now());
	},
);

// ── Hydration 2: explicit payload status wins over the hydrated sub status ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: payload status wins over hydrated Stripe status")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-precedence";
		const pro = products.pro({
			id: "dfu-hydrate-precedence-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const sub = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		// Fully cancel: hydrated status would be Expired.
		await ctx.stripeCli.subscriptions.cancel(sub.id);

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "active" }],
						},
					],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);

		// Payload said active -> active + full access, despite hydrated Expired.
		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.status).toBe(CusProductStatus.Active);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 100,
		});
	},
);

// ── Hydration 3: trial_ends_at + billing_cycle_anchor hydrated from period end ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: trial + anchor hydrated from Stripe current_period_end")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-trial";
		const pro = products.pro({
			id: "dfu-hydrate-trial-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const priceIds = getAllStripePriceIds({ fullProduct });
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const sub = await ctx.stripeCli.subscriptions.create({
			customer: fullCustomer.processor?.id as string,
			items: priceIds.map((price) => ({ price })),
			trial_period_days: 14,
		});
		const expectedTrialEndsAt = (sub.trial_end ?? 0) * 1000;
		const expectedPeriodEndMs = sub.items.data[0].current_period_end * 1000;

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.trial_ends_at).toBe(expectedTrialEndsAt);
		expect(cusProduct?.billing_cycle_anchor).toBe(expectedPeriodEndMs);
	},
);

// ── Hydration 4: canceled sub with no future period resolves to Expired (leak guard) ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: hydrated canceled sub with no future end is Expired (no access)")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-expired";
		const pro = products.pro({
			id: "dfu-hydrate-expired-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const sub = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		await ctx.stripeCli.subscriptions.cancel(sub.id);

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.status).toBe(CusProductStatus.Expired);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.remaining ?? 0).toBe(0);
	},
);

// ── Hydration 5: flashing is read-only — the Stripe sub is never mutated ──
test.concurrent(
	`${chalk.yellowBright("dfu.flash: flashing does not mutate the Stripe subscription")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-readonly";
		const pro = products.pro({
			id: "dfu-hydrate-readonly-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const sub = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		const before = await ctx.stripeCli.subscriptions.retrieve(sub.id);

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);

		const after = await ctx.stripeCli.subscriptions.retrieve(sub.id);
		expect(after.status).toBe(before.status);
		expect(after.canceled_at).toBe(before.canceled_at);
		expect(after.cancel_at_period_end).toBe(before.cancel_at_period_end);
		expect(after.items.data[0].current_period_end).toBe(
			before.items.data[0].current_period_end,
		);
	},
);
