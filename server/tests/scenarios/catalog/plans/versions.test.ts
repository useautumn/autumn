import { test } from "bun:test";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const freeId = "qa-vers-free";
const busyId = "qa-vers-busy";
const defaultId = "qa-vers-default";

test(`${chalk.yellowBright("catalog-qa: multi-version plans")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	const planIds = [freeId, busyId, defaultId];
	await resetCatalogPlans({ ctx, planIds });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: freeId,
				name: "QA Versions Empty",
				items: [messagesItem(100)],
			},
			{
				plan_id: busyId,
				name: "QA Versions Busy",
				items: [messagesItem(100)],
			},
			{
				plan_id: defaultId,
				name: "QA Versions Default",
				auto_enable: true,
				items: [messagesItem(100)],
			},
		],
	});
	const mintV2 = async ({ planId }: { planId: string }) => {
		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					versioning: "new_version", active: true,
					items: [messagesItem(200)],
				},
			],
		});
	};
	await mintV2({ planId: freeId });
	await mintV2({ planId: busyId });
	await seedNamedCustomer({
		ctx,
		planId: busyId,
		customerId: "qa-vers-alice",
		name: "Alice",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: defaultId,
		customerId: "qa-vers-old",
		name: "Old Default Cus",
		version: 1,
	});
	await mintV2({ planId: defaultId });

	logPlaybook({
		title: "Multi-version plans (v1 = 100 msgs, v2 = 200)",
		steps: [
			`"QA Versions Empty": delete This version (v2) → v1 remains. Entire plan → both gone.`,
			`"QA Versions Busy": Entire plan → archives v1 and v2 (Alice is on v1). This version (v2) → v2 gone, Alice stays on v1.`,
			`Open v1 of "QA Versions Busy", bump items, "Update this version", migrate → draft pinned to v1 (Alice).`,
			`Open latest (v2) of "QA Versions Busy", bump items, "Update existing version", migrate → no draft (Alice is on v1, v2 is empty).`,
			`Same latest bump + "Update all versions" + migrate → draft pinned to v1 only.`,
			`Open latest + "Create new version" → no draft (mint is the opt-out; UI must not send migration.draft).`,
			`"QA Versions Empty" item bump → no migrate step (no customers).`,
			`"QA Versions Default": Old Default Cus stays on v1; a new customer would attach v2.`,
		],
	});
});
