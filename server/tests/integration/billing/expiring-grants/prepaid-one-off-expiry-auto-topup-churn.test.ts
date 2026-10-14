import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	expiringTopUpOnRecurringPlan,
	expiringTopUpPlan,
	messageRows,
} from "./utils/prepaidOneOffExpiry";

const AUTO_TOPUP_SETTLE_MS = 90_000;

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: an auto top-up lands in its own loose grant")}`,
	async () => {
		const planId = "expiry-auto";
		const customerId = "expiry-auto-cus";
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

		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 20,
						quantity: 100,
					},
				],
			},
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});

		const fullCustomer = await pollUntil({
			fetch: () =>
				CusService.getFull({
					ctx,
					idOrInternalId: customerId,
					withEntities: true,
				}),
			until: (fullCustomer) =>
				messageRows({ fullCustomer, planId }).grants.length >= 2,
			timeoutMs: AUTO_TOPUP_SETTLE_MS,
		});
		const { customerProduct, keystones, grants } = messageRows({
			fullCustomer,
			planId,
		});

		expect(grants.length).toBe(2);
		expect(new Set(grants.map((grant) => grant.expires_at)).size).toBe(2);
		expect(
			grants
				.map((grant) => grant.balance)
				.sort((left, right) => (left ?? 0) - (right ?? 0)),
		).toEqual([15, 100]);
		expect(
			grants.find((grant) => grant.balance === 100)?.metadata?.source,
		).toBe("auto_topup");

		expect(keystones[0].balance).toBe(0);
		expect(
			customerProduct?.options.find(
				(entry) => entry.feature_id === TestFeature.Messages,
			)?.quantity,
		).toBe(1);

		const customer = await pollUntil({
			fetch: () => autumnV2_1.customers.get<ApiCustomerV5>(customerId),
			until: (customer) =>
				customer.balances[TestFeature.Messages].remaining === 115,
			timeoutMs: 10_000,
		});
		expect(customer.balances[TestFeature.Messages].remaining).toBe(115);
		expect(customerProduct?.is_custom).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid one-off expiry: grants outlive the plan on churn")}`,
	async () => {
		const planId = "expiry-churn";
		const customerId = "expiry-churn-cus";
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

		await autumnV2_2.subscriptions.update({
			customer_id: customerId,
			plan_id: planId,
			cancel_action: "cancel_immediately",
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const { grants } = messageRows({ fullCustomer, planId });

		expect(grants.length).toBe(1);
		expect(grants[0].balance).toBe(100);
		expect(grants[0].metadata?.plan_id).toBe(planId);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]?.remaining).toBe(100);
	},
);
