import { test } from "bun:test";
import { seedBaseWithVariant } from "@tests/integration/catalog-v2/plans/variants/utils/seedVariantPlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const teamId = "qa-euv-team";
const euId = "qa-euv-eu";

test(`${chalk.yellowBright("catalog-qa: Team v2 + EU pointing at v2")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [teamId, euId] });
	await seedBaseWithVariant({
		autumn: autumnV2_3,
		baseId: teamId,
		variantId: euId,
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{ plan_id: teamId, name: "QA Versioned Variant Team" },
			{ plan_id: euId, name: "QA Versioned Variant EU" },
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [{ plan_id: teamId, versioning: "new_version" }],
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-euv-alice",
		name: "Alice",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-euv-bob",
		name: "Bob",
	});

	logPlaybook({
		title: "Team v1+v2, EU points at Team v2 (Alice on Team v1, Bob on EU)",
		steps: [
			`Open EU — it should track Team v2.`,
			`On Team latest: delete This version (v2) → v2 gone, EU repoints to v1.`,
			`Re-run, open Team v1, delete This version → v1 gone, EU stays on v2.`,
			`Mint another Team version from the save dialog → EU pointer should follow latest.`,
			`On latest Team, bump items, follow EU, "Update existing version", migrate → EU op for Bob. No Team op (latest has no customers; Alice is on v1).`,
			`Same bump + "Update all versions" + migrate → Team v1 (Alice) + EU (Bob).`,
			`"Create new version" + follow EU → no draft (mint opt-out).`,
			`Pin EU (leave unchecked) + migrate → no EU op in the draft.`,
		],
	});
});
