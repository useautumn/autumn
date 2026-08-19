import { test } from "bun:test";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedAssignedSeat,
} from "../utils/catalogScenario.js";

const teamId = "qa-as-team";
const seatId = "qa-as-seat";

test(`${chalk.yellowBright("catalog-qa: assigned Seat on Team")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [teamId, seatId] });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: seatId,
				name: "QA Assigned Seat",
				items: [messagesItem(10)],
			},
			{
				plan_id: teamId,
				name: "QA Assigned Team",
				items: [messagesItem(100)],
				licenses: [{ license_plan_id: seatId, included: 2 }],
			},
		],
	});
	await seedAssignedSeat({
		ctx,
		parentId: teamId,
		childId: seatId,
		customerId: "qa-as-alice",
		name: "Alice",
	});

	logPlaybook({
		title: "Alice holds a Seat assignment on Team (not a Seat subscription)",
		steps: [
			`On Seat: bump 10→200, leave Team unchecked (pin) → catalog overlay stays 10. Alice stays on the old row (still 10). No draft (pin omits the parent).`,
			`Re-run, bump Seat, follow Team, migrate → draft is Team only. Seat must not appear in the filter (Alice is an assignment, not a Seat subscriber). Alice then sees 200.`,
			`Re-run, on Team remove the Seat license → assignment row is retired, not hard-deleted. Alice should not gain a new Seat.`,
		],
	});
});
