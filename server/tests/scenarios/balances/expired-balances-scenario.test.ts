import { test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const sleepUntil = (epochMs: number): Promise<void> =>
	new Promise((resolve) =>
		setTimeout(resolve, Math.max(epochMs - Date.now(), 0)),
	);

/**
 * Seeds a customer with every expired-balance shape the dashboard can render,
 * so the greyed-out rows, their sort order and their disabled actions can be
 * checked by hand. Left behind on purpose.
 */
test(
	`${chalk.yellowBright("scenario: expired balances for dashboard QA")}`,
	async () => {
		const customerId = "expired-balances-qa";

		const churned = products.base({
			id: "expired-qa-churned",
			items: [
				items.monthlyMessages({ includedUsage: 50 }),
				items.monthlyWords({ includedUsage: 500 }),
			],
		});
		const live = products.base({
			id: "expired-qa-live",
			items: [
				items.monthlyMessages({ includedUsage: 80 }),
				items.monthlyWords({ includedUsage: 900 }),
			],
		});

		// Attaching live second replaces churned (same main group), so churned's
		// entitlements become expired-plan balances.
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [churned, live] }),
			],
			actions: [
				s.attach({ productId: churned.id }),
				s.attach({ productId: live.id }),
			],
		});

		const autumnV1 = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.orgSecretKey,
		});

		const expiresAt = Date.now() + 3_000;

		// Two loose balances that will expire, on different features.
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 200,
			expires_at: expiresAt,
		});
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			granted_balance: 1_000,
			expires_at: expiresAt,
		});

		// Live loose balances alongside them, so the table mixes both states.
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
		});
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			granted_balance: 250,
		});

		// Usage on the live plan, so active rows show a partially filled bar.
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await sleepUntil(expiresAt + 1_000);

		console.log(chalk.bold("\n─── seeded for dashboard QA ───"));
		console.log({
			customerId,
			expiredPlan: `${churned.id} (Messages 50, Words 500)`,
			livePlan: `${live.id} (Messages 80, Words 900)`,
			expiredLoose: "Messages 200, Words 1000",
			liveLoose: "Messages 100, Words 250",
			tracked: "30 messages against the live plan",
			checkInDashboard: [
				"Plans filter → include Expired: the churned plan and its balances appear, greyed",
				"Expired rows sort last and never change the totals or usage bars",
				"Expired plan rows: no edit, no record usage, no delete",
				"Expired loose rows: delete is the only action left",
			],
		});
	},
	{ timeout: 180_000 },
);
