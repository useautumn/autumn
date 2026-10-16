/**
 * Upgrading a trialing subscription that a scheduled downgrade put on a Stripe schedule, to a plan with no trial.
 * The upgrade releases the schedule and must still end the trial in Stripe, as it does without a schedule.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { getSubsFromCusId } from "@tests/utils/expectUtils/expectSubUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const upgradeScheduledTrialAndExpect = async ({
	customerId,
	billingCycleAnchor,
}: {
	customerId: string;
	billingCycleAnchor?: "now";
}) => {
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
		trialDays: 14,
		cardRequired: true,
	});
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const ultra = products.ultra({
		items: [items.monthlyMessages({ includedUsage: 5000 })],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, pro, ultra] }),
		],
		actions: [
			s.billing.attach({ productId: premiumTrial.id }),
			s.billing.attach({ productId: pro.id }),
		],
	});

	const { subs: subsBefore } = await getSubsFromCusId({
		customerId,
		productId: premiumTrial.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		stripeCli: ctx.stripeCli,
	});
	expect(subsBefore[0].status).toBe("trialing");
	expect(subsBefore[0].schedule).toBeTruthy();

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: ultra.id,
		redirect_mode: "if_required",
		...(billingCycleAnchor && { billing_cycle_anchor: billingCycleAnchor }),
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [ultra.id],
		notPresent: [premiumTrial.id, pro.id],
	});
	await expectProductNotTrialing({
		customer,
		productId: ultra.id,
		nowMs: advancedTo,
	});

	const { subs } = await getSubsFromCusId({
		customerId,
		productId: ultra.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		stripeCli: ctx.stripeCli,
	});
	expect(subs[0].status).toBe("active");
	expect(subs[0].schedule).toBeNull();
};

test.concurrent(
	`${chalk.yellowBright("trial-upgrade-scheduled 1: upgrade with billing_cycle_anchor now ends the trial")}`,
	async () => {
		await upgradeScheduledTrialAndExpect({
			customerId: "trial-upgrade-scheduled-anchor-now",
			billingCycleAnchor: "now",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("trial-upgrade-scheduled 2: upgrade without anchor ends the trial in Stripe")}`,
	async () => {
		await upgradeScheduledTrialAndExpect({
			customerId: "trial-upgrade-scheduled-no-anchor",
		});
	},
);
