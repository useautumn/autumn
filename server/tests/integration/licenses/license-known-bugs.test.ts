/**
 * Regression pins for FOUR confirmed license bugs.
 *
 * Every test below asserts the CURRENT (buggy) behavior so it passes today.
 * Each header block states what the code SHOULD do once the bug is fixed —
 * when the fix lands, flip the "Red" assertion to the "Green" expectation.
 *
 * B1 — Customer deletion leaks license state.
 *   Red (now): deleteCustomer.ts bare-deletes rows via CusService.deleteByInternalId.
 *     No license reconcile runs, and license_parent_customer_product_id has no FK /
 *     ON DELETE cascade. Deleting a customer that holds a license pool + its own
 *     assignment simply drops the rows with no reconcile or seat credit-back.
 *   Green (after fix): deletion runs a license reconcile so pools/assignments are
 *     released cleanly and cross-customer seats are credited back.
 *
 * B2 — Tombstone divergence between plan read path and license balances.
 *   Red (now): loadApiPlanLicenses (plans.get / plans.list) emits links with
 *     included:0, so a re-linked "tombstone" still appears in a plan's `licenses`.
 *     buildLicenseBalances skips definitions where included<=0, so /licenses.list
 *     OMITS that pool. Same catalog link, two different answers.
 *   Green (after fix): decide one intended semantics — either both surfaces hide a
 *     tombstoned (included:0) link, or both keep it. They must agree.
 *
 * B3 — Trial-revert bypasses license reconcile.
 *   Red (now): tryProcessRevertExpiry flips cusProduct statuses inside a raw
 *     ctx.db.transaction and never calls afterLicenseMutation / any reconcile.
 *     Revert preserving assignments is the CORRECT outcome, but there is no
 *     self-heal pass, so any drift on the parent's pools is never corrected.
 *   Green (after fix): revert still preserves open assignments AND runs a reconcile
 *     so pool balances self-heal. (Skipped — see TODO; setup needs a paused
 *     previous plan under an on_trial_end:"revert" trial.)
 *
 * B4 — Status asymmetry: parent gate vs assignable resolution. NOT A BUG.
 *   LICENSE_PARENT_STATUSES = [Active, PastDue, Trialing] and
 *   LICENSE_ASSIGNABLE_STATUSES = [Active] differ, but the test below proves a
 *   Trialing parent is BOTH a visible pool AND assignable in practice — the two
 *   sets don't conflict for attach. Pinned here so a future change to either
 *   constant that breaks Trialing assignment fails loudly.
 */

import { expect, test } from "bun:test";
import type { LicenseBalanceResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeLicenseProduct = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

// B1 — customer deletion runs no license reconcile (deleteCustomer.ts does a
// bare row delete; license_parent_customer_product_id has no FK/cascade). The
// leak only manifests cross-customer: a DIFFERENT customer whose assignment
// draws on the deleted customer's pool is orphaned, and the deleted holder's
// seat is never credited back. That setup needs cross-customer pool sharing,
// which isn't expressible through the current initScenario DSL — TODO wire a
// two-customer scenario (or drive it via ctx.db) to repro the orphan.
test.skip("licenses-bug: B1 deleting a license-holder customer orphans cross-customer assignments", () => {
	expect(true).toBe(true);
});

test.concurrent(
	`${chalk.yellowBright("licenses-bug: B2 included:0 tombstone shows in plans.get but is omitted from licenses.list")}`,
	async () => {
		const parent = products.base({
			id: "bug-tombstone-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("bug-tombstone-license");

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "license-bug-tombstone",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 3,
		});
		// Re-link at included:0 — a removal "tombstone".
		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 0,
		});

		// Read path (loadApiPlanLicenses) keeps the included:0 link.
		const plan = (await autumnV2_2.post("/plans.get", {
			plan_id: parent.id,
		})) as {
			id: string;
			licenses?: Array<{ license_plan_id: string; included: number }>;
		};
		const tombstoneLink = plan.licenses?.find(
			(link) => link.license_plan_id === license.id,
		);
		expect(tombstoneLink).toMatchObject({
			license_plan_id: license.id,
			included: 0,
		});

		// Balance path (buildLicenseBalances) skips included<=0, so the pool is
		// absent — the divergence this test pins.
		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(pools.list.some((pool) => pool.license_plan_id === license.id)).toBe(
			false,
		);
	},
);

test.skip(`${chalk.yellowBright("licenses-bug: B3 trial-revert preserves assignments but never runs license reconcile")}`, async () => {
	// TODO(license-bug-B3): requires an on_trial_end:"revert" trial parent
	// stacked over a PAUSED previous plan so tryProcessRevertExpiry takes the
	// revert branch (previous_customer_product_id present + status Paused).
	// Reproduce by: attach previous plan -> attach revert-trial parent that
	// pauses the previous one -> assign a license seat -> advanceTestClock past
	// the trial so runProductCron hits tryProcessRevertExpiry. Then assert the
	// open assignment survives (correct) AND document that pool balances are
	// NOT reconciled (revertTrialExpiry.ts flips statuses in a raw
	// ctx.db.transaction with no afterLicenseMutation call). The pause/revert
	// stacking wiring is not expressible through the current initScenario DSL,
	// so this is skipped until a fixture for paused-previous + revert exists.
	expect(true).toBe(true);
});

test.concurrent(
	`${chalk.yellowBright("licenses-bug: B4 a Trialing parent is both a visible pool and assignable")}`,
	async () => {
		const parent = products.proWithTrial({
			id: "bug-status-parent",
			items: [items.dashboard()],
			trialDays: 7,
		});
		const license = makeLicenseProduct("bug-status-license");

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "license-bug-status",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});

		// LICENSE_PARENT_STATUSES includes Trialing → the trialing parent's pool
		// is visible in the inventory list.
		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicenseBalanceResponse[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0]).toMatchObject({
			license_plan_id: license.id,
			inventory: { included: 1, assigned: 0, available: 1 },
		});

		// Despite LICENSE_ASSIGNABLE_STATUSES = [Active], a Trialing parent
		// resolves as assignable in practice — attach succeeds and consumes a
		// seat. Pins that the two status sets do NOT conflict here (no bug).
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const poolsAfter = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsAfter.list[0].inventory).toMatchObject({
			included: 1,
			assigned: 1,
			available: 0,
		});
	},
);
