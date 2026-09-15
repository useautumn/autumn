import { test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const planId = "qa-expired-old";

test(`${chalk.yellowBright("catalog-qa: expired customer on v1, live customers on v2")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [planId] });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "QA Expired Old Version",
				items: [messagesItem(100)],
			},
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				versioning: "new_version",
				active: true,
				items: [messagesItem(200)],
			},
		],
	});

	await seedNamedCustomer({
		ctx,
		planId,
		customerId: "qa-expired-old-casey",
		name: "Expired Casey",
		version: 1,
		status: CusProductStatus.Expired,
	});
	await seedNamedCustomer({
		ctx,
		planId,
		customerId: "qa-expired-old-alice",
		name: "Alice",
		version: 2,
	});
	await seedNamedCustomer({
		ctx,
		planId,
		customerId: "qa-expired-old-bob",
		name: "Bob",
		version: 2,
	});

	logPlaybook({
		title: "v1 = 100 msgs (Expired Casey only), v2 = 200 msgs (Alice, Bob)",
		steps: [
			`Open v1 → delete "This version" → tombstone, not archive. Copy does not name "Expired Casey".`,
			`Open v2 → delete "This version" → blocked: cannot archive one version (Alice, Bob).`,
			`Delete "Entire plan" → Archive both. Copy names Alice and "1 more", not Casey.`,
			`Open v1, bump items, "Update this version", migrate → no draft (Casey is expired).`,
			`Open v2, bump items, "Update existing version", migrate → one draft covering Alice and Bob.`,
			`Same v2 bump + "Update all versions" + migrate → draft pinned to v2 only; v1 gets the edit with no draft.`,
			`Open v2 + "Create new version" → no draft; Alice and Bob stay on v2.`,
			`atmn pull, then comment v1 out of planVersions, atmn push → preview deletes v1 as tombstone, will_archive false.`,
		],
	});
});
