import { test } from "bun:test";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const teamId = "qa-2p-team";
const scaleId = "qa-2p-scale";
const seatId = "qa-2p-seat";

test(`${chalk.yellowBright("catalog-qa: two parents offer Seat")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [teamId, scaleId, seatId] });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: seatId,
				name: "QA Two-Parent Seat",
				items: [messagesItem(10)],
			},
			{
				plan_id: teamId,
				name: "QA Two-Parent Team",
				items: [messagesItem(100)],
				licenses: [{ license_plan_id: seatId, included: 2 }],
			},
			{
				plan_id: scaleId,
				name: "QA Two-Parent Scale",
				items: [messagesItem(100)],
				licenses: [{ license_plan_id: seatId, included: 2 }],
			},
		],
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-2p-alice",
		name: "Alice",
	});
	await seedNamedCustomer({
		ctx,
		planId: scaleId,
		customerId: "qa-2p-bob",
		name: "Bob",
	});
	await seedNamedCustomer({
		ctx,
		planId: seatId,
		customerId: "qa-2p-carol",
		name: "Carol",
	});

	logPlaybook({
		title:
			"Team + Scale both offer Seat (Alice on Team, Bob on Scale, Carol on Seat)",
		steps: [
			`On Seat: bump 10→200, follow both parents, "Update existing version", migrate → one draft. Parents cover Alice+Bob; a separate Seat op covers Carol.`,
			`Re-run, follow Team only (pin Scale) → Team Seat 200, Scale stays 10. Draft has Team, not Scale. Carol still on the Seat op.`,
			`Follow both + "Create new parent versions" → no parent draft (mint opt-out).`,
			`On Team: declare a Seat customize of 300 while Seat follows → Team lands on 300 (declared wins). Draft op is 300, not 200.`,
			`Delete Seat → archives (two parents still offer it).`,
		],
	});
});
