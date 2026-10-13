// Expiring prepaid one-off plan items: each purchase lands in a loose, expiring grant beside a
// 0-balance keystone row; grants outlive plan changes and churn.

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	expiringTopUpOnRecurringPlan,
	expiringTopUpPlan,
	messageRows,
} from "./utils/prepaidOneOffExpiry";

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: attach puts the purchase in a loose grant, keystone stays 0/0")}`,
	async () => {
		const planId = "expiry-attach";
		const customerId = "expiry-attach-cus";
		const { autumnV2_1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({ plans: [expiringTopUpPlan(planId)] });
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { customerProduct, keystones, grants } = messageRows({
			fullCustomer,
			planId,
		});

		// keystone: the plan's own row, pristine and never expiring
		expect(keystones.length).toBe(1);
		expect(keystones[0].balance).toBe(0);
		expect(keystones[0].expires_at).toBeNull();

		// grant: loose, holds the purchase, stamped
		expect(grants.length).toBe(1);
		const grant = grants[0];
		expect(grant.customer_product_id).toBeNull();
		expect(grant.balance).toBe(100);
		expect(grant.entitlement.allowance).toBe(100);
		expect(grant.expires_at).toBeGreaterThan(Date.now());
		expect(grant.metadata).toEqual({
			source: "attach",
			plan_id: planId,
			customer_product_id: customerProduct?.id,
		});
		expect(grant.entitlement_id).not.toBe(keystones[0].entitlement_id);

		// reporting: purchase counted exactly once
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].granted).toBe(100);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(100);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);

		expect(customerProduct?.is_custom).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: each manual top-up gets its own loose grant")}`,
	async () => {
		const planId = "expiry-topup";
		const customerId = "expiry-topup-cus";
		const { autumnV2_1, autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [expiringTopUpOnRecurringPlan(planId)],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		for (const quantity of [100, 200, 300]) {
			await autumnV2_2.subscriptions.update({
				customer_id: customerId,
				plan_id: planId,
				feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
			});
		}

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { customerProduct, keystones, grants } = messageRows({
			fullCustomer,
			planId,
		});

		// attach + three top-ups = four grants, none merged
		expect(grants.length).toBe(4);
		expect(
			grants
				.map((grant) => grant.balance)
				.sort((left, right) => (left ?? 0) - (right ?? 0)),
		).toEqual([100, 100, 200, 300]);
		expect(grants.every((grant) => (grant.balance ?? 0) > 0)).toBe(true);
		expect(grants.every((grant) => (grant.expires_at ?? 0) > Date.now())).toBe(
			true,
		);
		expect(
			grants.filter((grant) => grant.metadata?.source === "manual_topup")
				.length,
		).toBe(3);

		// keystone untouched, product not custom
		expect(keystones.length).toBe(1);
		expect(keystones[0].balance).toBe(0);
		expect(customerProduct?.is_custom).toBe(false);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages].remaining).toBe(700);
		expect(customer.balances[TestFeature.Messages].granted).toBe(700);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);
	},
);
