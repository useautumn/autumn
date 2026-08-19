import { test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogFeatures,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const onPlanId = "qa-feat-on-plan";
const tokensId = "qa-feat-tokens";
const creditsId = "qa-feat-credits";
const busyId = "qa-feat-busy";
const entityId = "qa-feat-entity";
const onPlanPlanId = "qa-feat-plan";
const busyPlanId = "qa-feat-busy-plan";
const entityPlanId = "qa-feat-entity-plan";

test(`${chalk.yellowBright("catalog-qa: referenced features")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({
		ctx,
		planIds: [onPlanPlanId, busyPlanId, entityPlanId],
	});
	await resetCatalogFeatures({
		ctx,
		featureIds: [creditsId, onPlanId, tokensId, busyId, entityId],
	});

	await autumnV2_3.catalogV2.update({
		features: [
			{
				feature_id: onPlanId,
				name: "QA On-Plan Feature",
				type: FeatureType.Metered,
				consumable: true,
			},
			{
				feature_id: tokensId,
				name: "QA Tokens",
				type: FeatureType.Metered,
				consumable: true,
			},
			{
				feature_id: creditsId,
				name: "QA Credits",
				type: FeatureType.CreditSystem,
				credit_schema: [{ metered_feature_id: tokensId, credit_cost: 2 }],
			},
			{
				feature_id: busyId,
				name: "QA Busy Feature",
				type: FeatureType.Metered,
				consumable: true,
			},
			{
				feature_id: entityId,
				name: "QA Entity Feature",
				type: FeatureType.Metered,
				consumable: false,
			},
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: onPlanPlanId,
				name: "QA Feature Plan",
				items: [{ feature_id: onPlanId, included: 50 }],
			},
			{
				plan_id: busyPlanId,
				name: "QA Feature Busy Plan",
				items: [{ feature_id: busyId, included: 20 }],
			},
			{
				plan_id: entityPlanId,
				name: "QA Entity-Scoped Plan",
				items: [{ ...messagesItem(10), entity_feature_id: entityId }],
			},
		],
	});
	await seedNamedCustomer({
		ctx,
		planId: busyPlanId,
		customerId: "qa-feat-alice",
		name: "Alice",
	});

	logPlaybook({
		title: "Referenced features",
		steps: [
			`Delete "QA On-Plan Feature" → archive (plan still grants it).`,
			`Delete "QA Tokens" → archive (credit system "QA Credits" still uses it).`,
			`Delete "QA Credits" and "QA Tokens" together if the UI allows → both can hard-delete.`,
			`Delete "QA Busy Feature" → archive, reason names customer "Alice".`,
			`Delete "QA Entity Feature" → archive (scopes an item on "QA Entity-Scoped Plan").`,
			`Rename or change type on "QA Busy Feature" → blocked (customer history).`,
		],
	});
});
