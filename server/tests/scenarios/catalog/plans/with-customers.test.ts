import { test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
	seedRewardOnPlan,
} from "../utils/catalogScenario.js";

const alicePlanId = "qa-busy-alice";
const twoPlanId = "qa-busy-two";
const expiredPlanId = "qa-busy-expired";
const rewardPlanId = "qa-busy-reward";
const pausedPlanId = "qa-busy-paused";
const customPlanId = "qa-busy-custom";

test(`${chalk.yellowBright("catalog-qa: plans with customers")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	const planIds = [
		alicePlanId,
		twoPlanId,
		expiredPlanId,
		rewardPlanId,
		pausedPlanId,
		customPlanId,
	];
	await resetCatalogPlans({ ctx, planIds });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: alicePlanId,
				name: "QA Alice Plan",
				items: [messagesItem(100)],
			},
			{
				plan_id: twoPlanId,
				name: "QA Two-Customer Plan",
				items: [messagesItem(100)],
			},
			{
				plan_id: expiredPlanId,
				name: "QA Expired Plan",
				items: [messagesItem(100)],
			},
			{
				plan_id: rewardPlanId,
				name: "QA Rewarded Plan",
				items: [messagesItem(100)],
			},
			{
				plan_id: pausedPlanId,
				name: "QA Paused Plan",
				items: [messagesItem(100)],
			},
			{
				plan_id: customPlanId,
				name: "QA Custom Plan",
				items: [messagesItem(100)],
			},
		],
	});
	await seedNamedCustomer({
		ctx,
		planId: alicePlanId,
		customerId: "qa-alice",
		name: "Alice",
	});
	await seedNamedCustomer({
		ctx,
		planId: twoPlanId,
		customerId: "qa-two-alice",
		name: "Alice",
	});
	await seedNamedCustomer({
		ctx,
		planId: twoPlanId,
		customerId: "qa-two-bob",
		name: "Bob",
	});
	await seedNamedCustomer({
		ctx,
		planId: expiredPlanId,
		customerId: "qa-expired-cus",
		name: "Expired Casey",
		status: CusProductStatus.Expired,
	});
	await seedRewardOnPlan({
		ctx,
		planId: rewardPlanId,
		rewardId: "qa-reward-busy",
		programId: "qa-reward-program-busy",
	});
	await seedNamedCustomer({
		ctx,
		planId: pausedPlanId,
		customerId: "qa-paused-cus",
		name: "Paused Pat",
		status: CusProductStatus.Paused,
	});
	await seedNamedCustomer({
		ctx,
		planId: customPlanId,
		customerId: "qa-custom-cus",
		name: "Custom Cam",
		isCustom: true,
	});

	logPlaybook({
		title: "Plans with customers / reward refs",
		steps: [
			`Delete "QA Alice Plan" → Archive. Copy: Attached to customer "Alice".`,
			`Delete "QA Two-Customer Plan" → Archive. Copy includes "and 1 more".`,
			`Delete "QA Expired Plan" → tombstone. Copy does not name "Expired Casey".`,
			`Delete "QA Rewarded Plan" → Archive. Copy mentions the reward program.`,
			`Rename "QA Alice Plan" → blocked (has customers).`,
			`Drafts — bump messages 100→200, then in PlanChangeDialog:`,
			`"QA Alice Plan" + "Update existing version" + migrate → draft for Alice. Check /migrations.`,
			`"QA Alice Plan" + "Create new version" → no draft (customers stay on v1).`,
			`"QA Alice Plan" name-only save → no migrate step, no draft.`,
			`"QA Paused Plan" + update in place + migrate → draft (paused still counts).`,
			`"QA Expired Plan" + update in place + migrate → no draft.`,
			`"QA Custom Plan" + migrate → "Apply to custom plans" switch. Off → Cam omitted; on → Cam included.`,
			`"QA Two-Customer Plan" + migrate → one draft covering Alice and Bob.`,
		],
	});
});
