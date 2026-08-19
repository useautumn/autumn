import { test } from "bun:test";
import { seedBaseWithVariant } from "@tests/integration/catalog-v2/plans/variants/utils/seedVariantPlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { logPlaybook, resetCatalogPlans } from "../utils/catalogScenario.js";

const teamId = "qa-eu-team";
const euId = "qa-eu";

test(`${chalk.yellowBright("catalog-qa: Team + Team EU (v1)")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [teamId, euId] });
	await seedBaseWithVariant({
		autumn: autumnV2_3,
		baseId: teamId,
		variantId: euId,
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{ plan_id: teamId, name: "QA Variant Team" },
			{ plan_id: euId, name: "QA Variant EU" },
		],
	});

	logPlaybook({
		title: "Team 100 msgs + EU 200 msgs (single version)",
		steps: [
			`On Team: add Dashboard and follow EU → EU keeps 200 and gains Dashboard. No migrate step (nobody attached).`,
			`Re-run, add Dashboard, leave EU unchecked (pin) → EU stays 200, no Dashboard. Still no draft.`,
			`Change Team billing controls / description → copies onto EU even without follow. EU name does not change.`,
			`Delete Team → 400, still has variants. Confirm button disabled.`,
			`Delete EU first, then Team → both gone.`,
			`Delete This version on Team (only v1) → 400, EU would have no live base.`,
		],
	});
});
