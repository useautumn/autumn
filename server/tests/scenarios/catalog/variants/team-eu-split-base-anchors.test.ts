import { test } from "bun:test";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { expectVariantPointerCorrect } from "@tests/integration/catalog-v2/plans/variants/utils/expectVariantPointer.js";
import { seedBaseVariantWithChildLicense } from "@tests/integration/catalog-v2/plans/variants/utils/seedVariantPlans.js";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogPlans,
	seedNamedCustomer,
} from "../utils/catalogScenario.js";

const teamId = "qa-sba-team";
const euId = "qa-sba-eu";
const seatId = "qa-sba-seat";

const seatLicense = { license_plan_id: seatId, included: 2 };

test(`${chalk.yellowBright("catalog-qa: EU v1+v2 on Team v1 (licensed), EU v3 on Team v2")}`, async () => {
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
			{
				plan_id: teamId,
				name: "QA Split Team",
				variants: [{ variant_plan_id: euId, name: "QA Split EU" }],
			},
			{ plan_id: seatId, name: "QA Split Seat" },
		],
	});
	// EU v2 stays on Team v1 and keeps Seat.
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: euId,
				versioning: "new_version",
				active: true,
				licenses: [seatLicense],
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
				licenses: [seatLicense],
			},
		],
	});
	// EU v3 inherits Team v1, then we pin only v3 onto Team v2.
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: euId,
				versioning: "new_version",
				active: true,
				licenses: [seatLicense],
			},
		],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: teamId,
				version: 2,
				variants: [{ variant_plan_id: euId, version: 3 }],
			},
		],
	});

	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-sba-alice",
		name: "Alice",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: teamId,
		customerId: "qa-sba-bob",
		name: "Bob",
		version: 2,
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-sba-dana",
		name: "Dana",
		version: 1,
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-sba-eve",
		name: "Eve",
		version: 2,
	});
	await seedNamedCustomer({
		ctx,
		planId: euId,
		customerId: "qa-sba-gina",
		name: "Gina",
		version: 3,
	});

	await expectVariantPointerCorrect({
		ctx,
		variantPlanId: euId,
		variantVersion: 1,
		basePlanId: teamId,
		baseVersion: 1,
	});
	await expectVariantPointerCorrect({
		ctx,
		variantPlanId: euId,
		variantVersion: 2,
		basePlanId: teamId,
		baseVersion: 1,
	});
	await expectVariantPointerCorrect({
		ctx,
		variantPlanId: euId,
		variantVersion: 3,
		basePlanId: teamId,
		baseVersion: 2,
	});
	for (const parentVersion of [1, 2, 3]) {
		await getFullLicenseProduct({
			ctx,
			parentPlanId: euId,
			parentVersion,
			licensePlanId: seatId,
		});
	}

	logPlaybook({
		title:
			"Team v1 (Alice) + v2 (Bob). EU v1 (Dana) + v2 (Eve) → Team v1, both offer Seat. EU v3 (Gina) → Team v2, offers Seat.",
		steps: [
			`Open Team v1 — variants list is EU v1 + v2. Open Team v2 — variants list is EU v3 only. EU v1/v2 sit under sibling_versions.`,
			`On Team latest: bump items, pin EU v3 only, "Update existing version", migrate → Gina. Dana + Eve stay (still on Team v1).`,
			`Same bump + pin EU v1 and v2 (off-anchor) → 400. Those rows are not anchored to Team v2.`,
			`On Team v1: bump items, pin EU v1 + v2, migrate → Dana + Eve. Gina stays.`,
			`On Team all_versions: pinnable set is EU v1 + v2 + v3. Each pin gets its own Team row's diff; no relink.`,
			`"Create new version" on Team while pinning EU v3 (Gina has customers) → mints EU v4 onto Team v3. v1+v2 stay on Team v1.`,
		],
	});
});
