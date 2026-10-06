/** A timestamp billing_cycle_anchor on a live subscription resets its cycle, and every plan on it, on the anchor. */

import { expect, test } from "bun:test";
import {
	findActiveCustomerProductById,
	formatMsToDate,
	ms,
	msToSeconds,
	type SetPlansParamsV0Input,
	secondsToMs,
} from "@autumn/shared";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState";
import { setupAnchorQuantityScenario } from "@tests/integration/billing/update-subscription/params/billing-cycle-anchor/setupAnchorQuantityScenario";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import { AUTUMN_STRIPE_METADATA_KEYS } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { CusService } from "@/internal/customers/CusService";
import { expectPreviewMatchesStripeUpcomingInvoice } from "../phase-proration/utils/phaseProrationUtils";
import {
	expectBillingCycleAnchorConsumed,
	expectCycleResetPhase,
} from "../utils/resyncUtils";
import { findStripeSubscriptionByStatus } from "../utils/subscriptionStateUtils";

const RELEASE_WEBHOOK_SETTLE_MS = 15_000;

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: a timestamp anchor with proration none resets the cycle without prorating")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-resync-live-anchor",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const anchorMs = advancedTo + ms.days(10);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					proration_behavior: "none",
					starts_at: "now",
					plans: [{ plan_id: pro.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expect(preview.warnings).toContainEqual(
			expect.objectContaining({
				type: "cycle_reset",
				severity: "warning",
				message: `The billing cycle resets on ${formatMsToDate(anchorMs)}.`,
			}),
		);

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		await expectCycleResetPhase({
			ctx,
			customerId,
			anchorMs,
			prorationBehavior: "none",
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: anchorMs,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs,
		});

		// Stripe moves the anchor without invoicing; the first invoice is the new cycle's full renewal.
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		const subscription = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		expect(subscription.billing_cycle_anchor).toBe(msToSeconds(anchorMs));

		const upcomingInvoice = await ctx.stripeCli.invoices.createPreview({
			subscription: subscription.id,
		});
		expect(
			upcomingInvoice.lines.data.some(
				(line) => line.parent?.subscription_item_details?.proration,
			),
		).toBe(false);
		expect(upcomingInvoice.total / 100).toBe(20);
		expect(preview.next_cycle?.total).toBe(20);
		expect(msToSeconds(preview.next_cycle?.starts_at ?? 0)).toBe(
			subscription.items.data[0]?.current_period_end,
		);

		// No invoice carries the reset, so Autumn re-anchors on Stripe's anchor move itself.
		await expectBillingCycleAnchorConsumed({
			ctx,
			customerId,
			productId: pro.id,
			anchorMs,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: secondsToMs(
				subscription.items.data[0]?.current_period_end ?? 0,
			),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: a retained add-on left on the subscription resets on the anchor too")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-resync-live-anchor-addon",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addOn.id }),
			],
		});

		const anchorMs = advancedTo + ms.days(10);
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			undeclared_plans: "retain",
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					proration_behavior: "none",
					starts_at: "now",
					plans: [{ plan_id: pro.id }],
				},
			],
		});

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Words,
			remaining: 50,
			nextResetAt: anchorMs,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: after a proration none anchor, a later prorated switch is the next invoice")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-resync-live-anchor-then-switch",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const anchorMs = advancedTo + ms.days(10);
		const switchAt = advancedTo + ms.days(20);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					proration_behavior: "none",
					starts_at: "now",
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: switchAt,
					proration_behavior: "prorate_immediately",
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		await autumnV2_4.billing.setPlans(params);
		await expectCycleResetPhase({
			ctx,
			customerId,
			anchorMs,
			prorationBehavior: "none",
		});

		// The anchor invoices nothing, so Stripe's next invoice is the switch.
		expect(msToSeconds(preview.next_cycle?.starts_at ?? 0)).toBe(
			msToSeconds(switchAt),
		);
		await expectPreviewMatchesStripeUpcomingInvoice({
			ctx,
			customerId,
			nextCycle: preview.next_cycle,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs: switchAt,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: new Decimal(preview.next_cycle?.total ?? 0)
				.toDecimalPlaces(2)
				.toNumber(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: a prepaid balance resets on a proration none anchor")}`,
	async () => {
		const pro = products.pro({
			items: [items.prepaidMessages({ billingUnits: 100, price: 10 })],
		});
		const featureQuantities = [
			{ feature_id: TestFeature.Messages, quantity: 200 },
		];

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-resync-live-anchor-prepaid",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id, options: featureQuantities }),
					s.track({
						featureId: TestFeature.Messages,
						value: 50,
						timeout: 2000,
					}),
				],
			});

		const anchorMs = advancedTo + ms.days(10);
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					proration_behavior: "none",
					starts_at: "now",
					plans: [{ plan_id: pro.id, feature_quantities: featureQuantities }],
				},
			],
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs,
		});

		// No invoice carries this reset, so the anchor move itself resets the prepaid grant.
		const subscription = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 200,
			usage: 0,
			nextResetAt: secondsToMs(
				subscription.items.data[0]?.current_period_end ?? 0,
			),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: a pooled balance re-anchors and refills on a proration none anchor")}`,
	async () => {
		const customerId = "set-plans-resync-live-anchor-pooled";
		const scenario = await setupAnchorQuantityScenario({
			customerId,
			quantity: 500,
			pooled: true,
			prepaidItem: { ...items.prepaidMessages(), pooled: true },
		});
		const { autumnV2_4, ctx, target, advancedTo, plan } = scenario;
		await autumnV2_4.track(
			{ customer_id: customerId, feature_id: TestFeature.Messages, value: 40 },
			{ timeout: 2000 },
		);

		const anchorMs = advancedTo + ms.days(7);
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			entity_id: target.entity_id,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					proration_behavior: "none",
					starts_at: "now",
					plans: [
						{
							plan_id: plan.id,
							feature_quantities: [
								{ feature_id: TestFeature.Messages, quantity: 500 },
							],
						},
					],
				},
			],
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: scenario.testClockId!,
			advancedTo,
			anchorMs,
		});

		// No invoice carries this reset, so the anchor move itself re-anchors the pool.
		const reanchored = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(reanchored.poolCustomerEntitlements[0]?.reset_cycle_anchor).toBe(
			anchorMs,
		);
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: TestFeature.Messages,
			remaining: 500,
			usage: 0,
			nextResetAt: addMonths(anchorMs, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: a schedule released outside Autumn before the anchor drops the pending reset")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-resync-live-anchor-released",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});
		const before = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});

		const anchorMs = advancedTo + ms.days(10);
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					starts_at: "now",
					plans: [{ plan_id: pro.id }],
				},
			],
		});
		await expectCycleResetPhase({ ctx, customerId, anchorMs });

		const scheduled = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		const scheduleId =
			typeof scheduled.schedule === "string"
				? scheduled.schedule
				: scheduled.schedule?.id;
		if (!scheduleId) throw new Error("Live subscription has no schedule");
		// A schedule Autumn doesn't own: restore won't rebuild it, so its reset is gone for good.
		await ctx.stripeCli.subscriptionSchedules.update(scheduleId, {
			metadata: { [AUTUMN_STRIPE_METADATA_KEYS.managedAt]: "" },
		});
		await ctx.stripeCli.subscriptionSchedules.release(scheduleId);

		// Stripe will never reset there now, so Autumn drops the pending reset.
		const periodEndMs = secondsToMs(
			before.items.data[0]?.current_period_end ?? 0,
		);
		await pollUntilAsserted({
			fetch: () => CusService.getFull({ ctx, idOrInternalId: customerId }),
			assert: (fullCustomer) => {
				const customerProduct = findActiveCustomerProductById({
					fullCus: fullCustomer,
					productId: pro.id,
				});
				expect(customerProduct?.billing_cycle_anchor_resets_at).toBeNull();
			},
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			nextResetAt: periodEndMs,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs,
		});

		const after = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		expect(after.billing_cycle_anchor).toBe(before.billing_cycle_anchor);
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(
			findActiveCustomerProductById({
				fullCus: fullCustomer,
				productId: pro.id,
			})?.billing_cycle_anchor,
		).toBe(secondsToMs(before.billing_cycle_anchor));
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: periodEndMs,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: a released Autumn schedule keeps its pending reset, and restore rebuilds it")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, autumnV2_2, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-resync-live-anchor-released-managed",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const anchorMs = advancedTo + ms.days(10);
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					starts_at: "now",
					plans: [{ plan_id: pro.id }],
				},
			],
		});
		const scheduled = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		const scheduleId =
			typeof scheduled.schedule === "string"
				? scheduled.schedule
				: scheduled.schedule?.id;
		if (!scheduleId) throw new Error("Live subscription has no schedule");
		await ctx.stripeCli.subscriptionSchedules.release(scheduleId);
		// Nothing observable changes on a kept reset, so settle on the release webhook.
		await timeout(RELEASE_WEBHOOK_SETTLE_MS);

		// Like its phases, an Autumn schedule's pending reset survives the release for restore.
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(
			findActiveCustomerProductById({
				fullCus: fullCustomer,
				productId: pro.id,
			})?.billing_cycle_anchor_resets_at,
		).toBe(secondsToMs(msToSeconds(anchorMs)));

		await autumnV2_2.billing.restore({ customer_id: customerId });
		await expectCycleResetPhase({ ctx, customerId, anchorMs });
	},
);
