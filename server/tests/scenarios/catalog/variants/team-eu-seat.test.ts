import { test } from "bun:test";
import { seedBaseVariantWithChildLicense } from "@tests/integration/catalog-v2/plans/variants/utils/seedVariantPlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const teamId = "qa-eus-team";
const euId = "qa-eus-eu";
const seatId = "qa-eus-seat";

test(`${chalk.yellowBright("catalog-qa: Team + EU both offer Seat")}`, async () => {
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
			{ plan_id: teamId, name: "QA Compose Team" },
			{ plan_id: euId, name: "QA Compose EU" },
			{ plan_id: seatId, name: "QA Compose Seat" },
		],
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-eus-alice",
		name: "Alice",
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-eus-bob",
		name: "Bob",
	});

	logPlaybook({
		title: "Team + EU both offer Seat (Alice on Team, Bob on EU)",
		steps: [
			`On Seat: bump 10→200, follow both parents, "Update existing version", migrate → one draft. Team op for Alice, EU op for Bob. Seat itself is not a customer filter.`,
			`Re-run, follow EU only (pin Team) → EU Seat 200, Team Seat stays 10. Draft has EU, not Team.`,
			`On Team: bump plan messages and Seat overlay in one save, follow EU → plan vs license conflict copy in the dialog. Draft ops split: plan-body vs upsert_licenses.`,
			`"Create new version" on Team while following EU → no draft.`,
			`Delete Team → 400 (EU still exists). Delete Seat → archives (parents still offer it).`,
		],
	});
});
