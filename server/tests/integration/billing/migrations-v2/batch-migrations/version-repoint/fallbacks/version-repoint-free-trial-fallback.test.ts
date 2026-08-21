import { expect, test } from "bun:test";
import { FreeTrialDuration } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import {
	expectPerCustomerLaneWithRejections,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

test.skip(
	`${chalk.yellowBright("batch version repoint trial fallback: a changed free-trial config rejects and lands per-customer")}`,
	async () => {
		const stem = uniqueStem("bvr-trial-fallback");
		const customerId = `${stem}-customer`;
		const plan = products.baseWithTrial({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
			cardRequired: false,
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(before.trialEndsAt).not.toBeNull();

		// Identical items — only the trial length changes between versions.
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 100 })],
			free_trial: {
				duration_length: 30,
				duration_type: FreeTrialDuration.Day,
				card_required: false,
			},
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: {
				customer: {
					plan: { plan_id: plan.id, version: 1, custom: false },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						version: 2,
					},
				],
			},
		});

		expectPerCustomerLaneWithRejections({
			result,
			codes: ["free_trial_transition"],
		});
		expect(
			result?.rejections?.map((rejection) => String(rejection.code)),
		).toEqual(["free_trial_transition"]);

		// The per-customer lane still lands the version and carries the row's
		// existing trial end rather than restarting the target's 30-day trial.
		const after = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(after.version).toBe(2);
		expect(after.trialEndsAt).toBe(before.trialEndsAt);
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint trial control: identical trial configs across versions still batch")}`,
	async () => {
		const stem = uniqueStem("bvr-trial-control");
		const customerId = `${stem}-customer`;
		const plan = products.baseWithTrial({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
			cardRequired: false,
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});

		// Items change, trial config stays the same — freeTrialsAreSame holds.
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
			free_trial: {
				duration_length: 14,
				duration_type: FreeTrialDuration.Day,
				card_required: false,
			},
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: {
				customer: {
					plan: { plan_id: plan.id, version: 1, custom: false },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						version: 2,
					},
				],
			},
		});

		expect(result?.lane).toBe("batch");
		expect(result?.rejections ?? []).toEqual([]);
		const after = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(after.id).toBe(before.id);
		expect(after.version).toBe(2);
		expect(after.trialEndsAt).toBe(before.trialEndsAt);
	},
);
