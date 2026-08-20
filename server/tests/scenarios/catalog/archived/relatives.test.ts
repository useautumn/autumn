import { test } from "bun:test";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { seedBaseWithVariant } from "@tests/integration/catalog-v2/plans/variants/utils/seedVariantPlans.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const teamId = "qa-ar-team";
const seatId = "qa-ar-seat";
const baseId = "qa-ar-base";
const euId = "qa-ar-eu";
const draftId = "qa-ar-draft";

test(`${chalk.yellowBright("catalog-qa: archived relatives")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({
		ctx,
		planIds: [teamId, seatId, baseId, euId, draftId],
	});

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: seatId,
				name: "QA Archived Seat",
				items: [messagesItem(10)],
			},
			{
				plan_id: teamId,
				name: "QA Archived Team",
				items: [messagesItem(100)],
				licenses: [{ license_plan_id: seatId, included: 1 }],
			},
			{ plan_id: draftId, name: "QA Archived Draft Plan" },
		],
	});
	await seedBaseWithVariant({
		autumn: autumnV2_3,
		baseId,
		variantId: euId,
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{ plan_id: baseId, name: "QA Archived Base" },
			{ plan_id: euId, name: "QA Archived EU" },
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{ plan_id: teamId, archived: true },
			{ plan_id: euId, archived: true },
			{ plan_id: draftId, archived: true },
		],
	});
	await seedNamedCustomer({
		ctx,
		planId: draftId,
		customerId: "qa-ar-draft-cus",
		name: "Draft Casey",
	});

	logPlaybook({
		title: "Archived Team (offers live Seat) + archived EU under live Base",
		steps: [
			`Show archived → "QA Archived Team" and "QA Archived EU" and "QA Archived Draft Plan". Unarchive works from the delete dialog.`,
			`On live Seat: save an item bump → archived Team is omitted from license parents (does not follow). No parent draft for archived Team.`,
			`On live Base: change description / billing controls → still copies onto archived EU. EU name stays. Settings-only → no draft.`,
			`Try to customize archived EU from Base without unarchiving → 400.`,
			`On "QA Archived Draft Plan": bump items and confirm migrate → no draft (archived rows skip drafts). Unarchive first if you want a draft.`,
		],
	});
});
