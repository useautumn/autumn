/**
 * Variants and license links are not reconciled: a variant never inherits its
 * base's links, a variant linked as a seat plan creates no pools so the seats it
 * sells can never be assigned, and a variant parent leaves the seat plan
 * un-editable. Until propagation handles them, linking either side is refused.
 *
 * Red: both links are accepted.
 * Green: both are rejected at link time.
 */
import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const INCLUDED_SEATS = 1;

test(`${chalk.yellowBright("licenses: a variant cannot take part in a license link")}`, async () => {
	const idPrefix = `variant-link-rejected-${Date.now().toString(36)}`;

	const parent = products.base({
		id: `${idPrefix}-pro`,
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: `${idPrefix}-dev-seat`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
		group: `${idPrefix}-dev-seat-licenses`,
	});

	const scenario = await initScenario({
		customerId: `${idPrefix}-customer`,
		setup: [s.customer(), s.products({ list: [parent, devSeat] })],
		actions: [],
	});

	const { autumnV2_3 } = scenario;

	const parentVariant = await autumnV2_3.post("/plans.create_variant", {
		base_plan_id: parent.id,
		variant_plan_id: `${idPrefix}-pro-annual`,
		name: "Pro Annual",
	});
	const seatVariant = await autumnV2_3.post("/plans.create_variant", {
		base_plan_id: devSeat.id,
		variant_plan_id: `${idPrefix}-dev-seat-annual`,
		name: "Dev Seat Annual",
	});
	expect(parentVariant).toBeDefined();
	expect(seatVariant).toBeDefined();

	// A variant as the seat plan mints no pools, so its seats can never be assigned.
	const linkVariantSeat = autumnV2_3.post("/plans.update", {
		plan_id: parent.id,
		licenses: [
			{
				license_plan_id: `${idPrefix}-dev-seat-annual`,
				included: INCLUDED_SEATS,
			},
		],
	});
	await expect(linkVariantSeat).rejects.toThrow(/variant/i);

	// A variant parent leaves the seat plan un-editable.
	const linkVariantParent = autumnV2_3.post("/plans.update", {
		plan_id: `${idPrefix}-pro-annual`,
		licenses: [{ license_plan_id: devSeat.id, included: INCLUDED_SEATS }],
	});
	await expect(linkVariantParent).rejects.toThrow(/variant/i);
});
