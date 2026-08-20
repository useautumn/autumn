import { test } from "bun:test";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { logPlaybook, resetCatalogPlans } from "../utils/catalogScenario.js";

const teamId = "qa-lic-team";
const seatId = "qa-lic-seat";

test(`${chalk.yellowBright("catalog-qa: Team offers Seat")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [teamId, seatId] });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: seatId,
				name: "QA License Seat",
				items: [messagesItem(10)],
			},
			{
				plan_id: teamId,
				name: "QA License Team",
				items: [messagesItem(100)],
				licenses: [{ license_plan_id: seatId, included: 2 }],
			},
		],
	});

	logPlaybook({
		title: "Team offers Seat (nobody attached)",
		steps: [
			`On Team: drop the Seat license and save → link gone.`,
			`Re-run, then customize Seat overlay on Team (e.g. 300 messages) → Team's Seat is customized.`,
			`On Seat: bump 10→200 and check Team in propagate (follow) → Team Seat becomes 200. No migrate step (nobody attached).`,
			`Re-run, bump Seat, leave Team unchecked (pin) → Team Seat stays 10. Still no draft.`,
			`Delete Seat while Team still offers it → Archive. Copy: Plan "QA License Team" offers this as a license.`,
			`Delete Team first (hard delete), then Seat → Seat hard-deletes (parent is gone).`,
		],
	});
});
