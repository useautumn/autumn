/**
 * TDD test for blocking direct plan operations on seat-holding entities.
 *
 * Contract under test:
 *   New behaviors:
 *     - billing.attach with entity_id where the entity holds a license
 *       assignment (customer product with customer_license_link_id) -> 400.
 *     - billing.update_subscription with entity_id targeting such an
 *       entity -> 400.
 *   Side effects:
 *     - Neither call mutates the entity's seat or the pool counters.
 *
 * Pre-impl red: both calls succeed (or fail for unrelated reasons),
 * attaching plans directly onto a licensed entity.
 * Post-impl green: handleEntityLicenseAssignmentErrors rejects both.
 */
import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("licenses guard: attach and update_subscription on a seat-holding entity reject")}`, async () => {
	const customerId = "entity-seat-plan-guard";

	const parent = products.base({
		id: "seat-guard-parent",
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: "seat-guard-seat",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: "seat-guard-licenses",
	});
	const addOnPlan = products.base({
		id: "seat-guard-pro",
		items: [items.monthlyPrice({ price: 10 })],
		group: "seat-guard-other",
	});

	const { autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [parent, devSeat, addOnPlan] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeat.id,
				included: 2,
			}),
		],
	});

	await autumnV2_3.billing.attach({
		customer_id: customerId,
		plan_id: parent.id,
	});

	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [
			{
				entity_id: "guard-seat-1",
				name: "Seat 1",
				feature_id: TestFeature.Users,
			},
		],
	});

	// ── Contract: attach onto the licensed entity rejects ────────────────
	await expectAutumnError({
		errMessage: "holds a license",
		func: () =>
			autumnV2_3.billing.attach({
				customer_id: customerId,
				plan_id: addOnPlan.id,
				entity_id: "guard-seat-1",
			}),
	});

	// ── Contract: update_subscription onto the licensed entity rejects ───
	await expectAutumnError({
		errMessage: "holds a license",
		func: () =>
			autumnV2_3.billing.update({
				customer_id: customerId,
				plan_id: devSeat.id,
				entity_id: "guard-seat-1",
				customize: { price: { amount: 40, interval: "month" } },
			}),
	});

	// ── Side effect: pool untouched (1 seat used of 2 included) ──────────
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: parent.id,
				granted: 2,
				usage: 1,
				remaining: 1,
			},
		],
	});
});
