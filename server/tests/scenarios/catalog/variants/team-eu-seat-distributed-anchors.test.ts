import { test } from "bun:test";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { seedBaseVariantWithChildLicense } from "@tests/integration/catalog-v2/plans/variants/utils/seedVariantPlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const teamId = "qa-dva-team";
const euId = "qa-dva-eu";
const seatId = "qa-dva-seat";

test(`${chalk.yellowBright("catalog-qa: Team/EU v1→Seat v1, v2→Seat v2")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [teamId, euId, seatId] });
	await seedBaseVariantWithChildLicense({
		autumn: autumnV2_3,
		baseId: teamId,
		variantId: euId,
		childId: seatId,
		customizeLicenses: false,
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{ plan_id: teamId, name: "QA Anchor Team" },
			{ plan_id: euId, name: "QA Anchor EU" },
			{ plan_id: seatId, name: "QA Anchor Seat" },
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: seatId,
				versioning: "new_version",
				active: true,
				items: [messagesItem(20)],
			},
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: teamId,
				versioning: "new_version",
				active: true,
				items: [messagesItem(200)],
				licenses: [
					{ license_plan_id: seatId, included: 2, version_slug: "v2" },
				],
			},
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: euId,
				versioning: "new_version",
				active: true,
				licenses: [
					{ license_plan_id: seatId, included: 2, version_slug: "v2" },
				],
			},
		],
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-dva-alice",
		name: "Alice",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-dva-bob",
		name: "Bob",
		version: 2,
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-dva-dana",
		name: "Dana",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-dva-eve",
		name: "Eve",
		version: 2,
	});
	await seedNamedCustomer({
		ctx,
		planId: seatId,
		customerId: "qa-dva-frank",
		name: "Frank",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: seatId,
		customerId: "qa-dva-carol",
		name: "Carol",
		version: 2,
	});

	logPlaybook({
		title:
			"Team v1 (Alice) + v2 (Bob), EU v1 (Dana) + v2 (Eve), Seat v1 (Frank) + v2 (Carol). Team/EU v1→Seat v1; Team/EU v2→Seat v2.",
		steps: [
			`Open Team latest — Seat link is v2. Open Team v1 — Seat link is v1. Same split on EU.`,
			`On Seat latest: bump 20→200, follow Team+EU, "Update existing version", migrate → Bob + Eve + Carol. Alice, Dana, Frank stay on Seat v1.`,
			`Re-run, follow both, "Update all versions", migrate → each parent row follows the Seat version it anchors. All six customers move.`,
			`On Seat v1: bump items, "Update this version", follow both, migrate → Alice + Dana + Frank. Bob/Eve/Carol stay.`,
			`Re-run from Seat latest, follow EU only (pin Team) → EU v2 follows, Team v2 stays. Draft has EU + Carol, not Team.`,
			`"Create new version" on Seat while following Team+EU → no draft. Latest parents re-point to Seat v3; v1 parents stay on Seat v1.`,
			`Delete Seat This version (v1) → 400 (Team v1 + EU v1 still link). Unlink those parents, then delete works.`,
		],
	});
});
