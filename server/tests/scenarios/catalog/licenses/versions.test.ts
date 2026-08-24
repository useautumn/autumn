import { test } from "bun:test";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const teamId = "qa-lv-team";
const seatId = "qa-lv-seat";

test(`${chalk.yellowBright("catalog-qa: Team v1+v2 both offer Seat")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [teamId, seatId] });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: seatId,
				name: "QA License-Version Seat",
				items: [messagesItem(10)],
			},
			{
				plan_id: teamId,
				name: "QA License-Version Team",
				items: [messagesItem(100)],
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
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-lv-alice",
		name: "Alice",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-lv-bob",
		name: "Bob",
		version: 2,
	});
	await seedNamedCustomer({
		ctx,
		planId: seatId,
		customerId: "qa-lv-carol",
		name: "Carol",
	});

	logPlaybook({
		title:
			"Team v1 (100 msgs) + v2 (200 msgs) both offer Seat (Alice on v1, Bob on v2, Carol on Seat)",
		steps: [
			`On Seat: bump 10→200, follow Team, "Update existing version", migrate → Team v2 overlay 200, v1 stays 10. Draft: Team op for Bob, Seat op for Carol. Alice stays at 10.`,
			`Re-run, follow Team, "Update all versions", migrate → both Team versions 200. Draft: Alice (v1) + Bob (v2) + Carol.`,
			`Re-run, leave Team unchecked (pin) → both overlays stay 10. Draft is Seat-only (Carol).`,
			`Follow Team + "Create new parent versions" → Team v3 minted, no parent draft. Alice/Bob stay.`,
			`On Team v1: customize Seat overlay to 300, "Update this version", migrate → v1 is 300, v2 stays 10. Draft: Alice only.`,
			`On Team latest: "Create new version" without re-declaring licenses → v3 has no Seat link.`,
			`Delete Seat → archives (v1 and v2 still offer it). Delete Team This version (v2) → archives v2 (Bob); Seat still offered by v1.`,
		],
	});
});
