import { test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { logPlaybook, resetCatalogPlans } from "../utils/catalogScenario.js";

const plainId = "qa-plain";
const archivedId = "qa-plain-arch";
const trialId = "qa-plain-trial";
const defaultId = "qa-plain-default";
const oneOffId = "qa-plain-oneoff";
const sinkId = "qa-plain-sink";

test(`${chalk.yellowBright("catalog-qa: unused plans")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	const planIds = [plainId, archivedId, trialId, defaultId, oneOffId, sinkId];
	await resetCatalogPlans({ ctx, planIds });

	await autumnV2_3.catalogV2.update({
		plans: [
			{ plan_id: plainId, name: "QA Unused" },
			{ plan_id: archivedId, name: "QA Unused Archived" },
			{
				plan_id: trialId,
				name: "QA Trial Plan",
				items: [messagesItem(50)],
				free_trial: {
					duration_type: FreeTrialDuration.Day,
					duration_length: 14,
					card_required: false,
				},
			},
			{
				plan_id: defaultId,
				name: "QA Default Free",
				auto_enable: true,
				items: [messagesItem(100)],
			},
			{
				plan_id: oneOffId,
				name: "QA One-Off",
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 0,
						price: {
							amount: 10,
							interval: BillingInterval.OneOff,
							billing_method: BillingMethod.Prepaid,
							billing_units: 1,
						},
					},
				],
			},
			{
				plan_id: sinkId,
				name: "QA Kitchen Sink",
				items: [
					{ feature_id: TestFeature.Dashboard },
					messagesItem(100),
					{
						feature_id: TestFeature.Words,
						included: 50,
						reset: { interval: ResetInterval.Month },
						price: {
							amount: 0.5,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.UsageBased,
							billing_units: 1,
						},
					},
				],
				price: { amount: 20, interval: BillingInterval.Month },
			},
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [{ plan_id: archivedId, archived: true }],
	});

	logPlaybook({
		title: "Unused plans (nobody attached)",
		steps: [
			`Delete "QA Unused" → gone. Dialog is delete, not archive.`,
			`Show archived → delete "QA Unused Archived" → gone.`,
			`Edit "QA Kitchen Sink" items / base price / details → save, no version picker.`,
			`Bump items on "QA Unused" → no migrate step and no draft (nobody attached).`,
			`Name-only save on "QA Unused" → no draft.`,
			`Edit "QA Trial Plan" trial fields, or clear the trial.`,
			`Try auto_enable on "QA One-Off" → 400.`,
			`Try adding a trial to "QA One-Off" → 400.`,
			`Rename "QA Unused" (if it still exists) → id changes, no customers so it should work.`,
		],
	});
});
