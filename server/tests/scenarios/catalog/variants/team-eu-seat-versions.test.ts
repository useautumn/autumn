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

const teamId = "qa-ult-team";
const euId = "qa-ult-eu";
const seatId = "qa-ult-seat";

test(`${chalk.yellowBright("catalog-qa: Team+EU+Seat all versioned")}`, async () => {
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
			{ plan_id: teamId, name: "QA Combo Team" },
			{ plan_id: euId, name: "QA Combo EU" },
			{ plan_id: seatId, name: "QA Combo Seat" },
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: euId,
				versioning: "new_version", active: true,
				licenses: [{ license_plan_id: seatId, included: 2 }],
			},
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: teamId,
				versioning: "new_version", active: true,
				items: [messagesItem(200)],
				licenses: [{ license_plan_id: seatId, included: 2 }],
			},
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: seatId,
				versioning: "new_version", active: true,
				items: [messagesItem(20)],
			},
		],
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-ult-alice",
		name: "Alice",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-ult-bob",
		name: "Bob",
		version: 2,
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-ult-dana",
		name: "Dana",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-ult-eve",
		name: "Eve",
		version: 2,
	});
	await seedNamedCustomer({
		ctx,
		planId: seatId,
		customerId: "qa-ult-frank",
		name: "Frank",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: seatId,
		customerId: "qa-ult-carol",
		name: "Carol",
		version: 2,
	});

	logPlaybook({
		title:
			"Team v1 (Alice) + v2 (Bob), EU v1 (Dana) + v2 (Eve), Seat v1 (Frank) + v2 (Carol). EU v1→Team v1→Seat v1; EU v2→Team v2→Seat v2.",
		steps: [
			`Open EU latest — tracks Team v2, Seat link is v2. Open EU v1 — tracks Team v1, Seat link is v1.`,
			`On Seat latest: bump 20→200, follow Team+EU, "Update existing version", migrate → Bob + Eve + Carol. Alice, Dana, Frank stay on Seat v1.`,
			`Re-run, follow both, "Update all versions", migrate → Alice, Bob, Dana, Eve, Frank, Carol.`,
			`On Seat v1: bump items, "Update this version", follow both, migrate → Alice + Dana + Frank. Bob/Eve/Carol stay.`,
			`Re-run from Seat latest, follow EU only (pin Team) → EU v2 overlay 200, Team stays. Draft has EU + Carol, not Team.`,
			`On Team latest: bump items, follow EU, "Update existing version", migrate → Bob + Eve. Dana stays (historical EU).`,
			`"Create new version" on Seat while following Team+EU → no draft. Latest parents re-point to Seat v3; v1 parents stay on Seat v1.`,
			`"Create new version" on Team while following EU → no draft. EU v2 pointer follows Team v3; EU v1 stays on Team v1.`,
			`On Team latest: "Create new version" without re-declaring licenses → Team v3 has no Seat link.`,
			`Delete Seat This version (v2) → archives v2 (Carol); latest parents repoint to Seat v1. Delete Team entirely → 400 (EU still exists).`,
		],
	});
});
