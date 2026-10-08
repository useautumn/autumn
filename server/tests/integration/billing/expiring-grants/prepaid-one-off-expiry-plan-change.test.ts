// Expiring prepaid one-off plan items: each purchase lands in a loose, expiring grant beside a
// 0-balance keystone row; grants outlive plan changes and churn.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	CusProductStatus,
	ms,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { expiringItem, messageRows } from "./utils/prepaidOneOffExpiry";

/** A normal monthly plan whose one feature item is the expiring one-off prepaid. */
const monthlyPlanWithExpiringItem = (planId: string) => ({
	plan_id: planId,
	name: "Monthly + Expiring Credits",
	price: { amount: 20, interval: BillingInterval.Month },
	items: [expiringItem],
});

/** A monthly plan with only included credits — no expiring item at all. */
const monthlyPlanWithIncludedOnly = (planId: string) => ({
	plan_id: planId,
	name: "Monthly + Included Credits",
	price: { amount: 50, interval: BillingInterval.Month },
	items: [
		{
			feature_id: TestFeature.Messages,
			included: 500,
			reset: { interval: ResetInterval.Month },
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: a partly used grant survives an upgrade with its expiry")}`,
	async () => {
		const proId = "expiry-up-pro";
		const premiumId = "expiry-up-premium";
		const customerId = "expiry-upgrade-cus";
		const { autumnV2_1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				monthlyPlanWithExpiringItem(proId),
				monthlyPlanWithIncludedOnly(premiumId),
			],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: proId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		// Burn 50 of the 200 → the grant sits at 150.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await timeout(2000);

		const beforeGrant = messageRows({
			fullCustomer: await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
				withEntities: true,
			}),
			planId: proId,
		}).grants[0];
		expect(beforeGrant.balance).toBe(150);

		// ── act: upgrade to premium (500 included, no expiring item)
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: premiumId,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { grants } = messageRows({ fullCustomer, planId: proId });

		// the grant is the SAME row, untouched: same id, same balance, same expiry
		expect(grants.length).toBe(1);
		expect(grants[0].id).toBe(beforeGrant.id);
		expect(grants[0].balance).toBe(150);
		expect(grants[0].expires_at).toBe(beforeGrant.expires_at);
		expect(grants[0].metadata?.plan_id).toBe(proId);

		// 500 from premium + 150 carried = 650 spendable; the 50 already spent
		// is still real usage against the 200 originally purchased.
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(650);
		expect(customer.balances[TestFeature.Messages].granted).toBe(700);
		expect(customer.balances[TestFeature.Messages].usage).toBe(50);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: a partly used grant survives a downgrade with its expiry")}`,
	async () => {
		const premiumId = "expiry-down-premium";
		const proId = "expiry-down-pro";
		const customerId = "expiry-downgrade-cus";
		const { autumnV2_1, autumnV2_3, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [s.customer({ paymentMethod: "success", testClock: true })],
				actions: [],
			});

		// premium is the expiring host here so the grant exists before we step down
		await autumnV2_3.catalogV2.update({
			plans: [
				{
					...monthlyPlanWithExpiringItem(premiumId),
					name: "Pricier Monthly + Expiring Credits",
					price: { amount: 50, interval: BillingInterval.Month },
				},
				{
					...monthlyPlanWithIncludedOnly(proId),
					name: "Cheaper Monthly + Included Credits",
					price: { amount: 20, interval: BillingInterval.Month },
				},
			],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: premiumId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await timeout(2000);

		const beforeGrant = messageRows({
			fullCustomer: await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
				withEntities: true,
			}),
			planId: premiumId,
		}).grants[0];
		expect(beforeGrant.balance).toBe(150);

		// ── act: downgrade to the cheaper plan. A cheaper plan is scheduled for
		// end of cycle, so premium stays live now and pro takes over at renewal.
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: proId,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { grants } = messageRows({ fullCustomer, planId: premiumId });

		// the grant is untouched by the scheduling
		expect(grants.length).toBe(1);
		expect(grants[0].id).toBe(beforeGrant.id);
		expect(grants[0].balance).toBe(150);
		expect(grants[0].expires_at).toBe(beforeGrant.expires_at);

		const scheduled = fullCustomer.customer_products.find(
			(cp) => cp.product.id === proId,
		);
		expect(scheduled?.status).toBe(CusProductStatus.Scheduled);

		// still spendable today; the plain plan's 500 only arrives at renewal
		const beforeRenewal =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(beforeRenewal.balances[TestFeature.Messages].remaining).toBe(150);

		// ── advance past the cycle boundary so the scheduled plan activates
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: advancedTo + ms.days(35),
			waitForSeconds: 30,
		});

		const afterRenewal = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		expect(
			afterRenewal.customer_products.find((cp) => cp.product.id === proId)
				?.status,
		).toBe(CusProductStatus.Active);

		// the grant survived the completed transition, byte for byte
		const survivors = messageRows({
			fullCustomer: afterRenewal,
			planId: premiumId,
		}).grants;
		expect(survivors.length).toBe(1);
		expect(survivors[0].id).toBe(beforeGrant.id);
		expect(survivors[0].balance).toBe(150);
		expect(survivors[0].expires_at).toBe(beforeGrant.expires_at);

		// 500 from the plain plan + 150 carried
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(650);
	},
);
