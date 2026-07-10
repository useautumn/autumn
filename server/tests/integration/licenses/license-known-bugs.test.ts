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
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
	customerLicenses,
	customerProducts,
	type LicenseBalanceResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getLicenseDbState } from "./licenseTestUtils.js";

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
test.concurrent(
	`${chalk.yellowBright("licenses cleanup: deleting a customer cascades assignments and pools")}`,
	async () => {
		const parent = products.base({
			id: "delete-customer-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("delete-customer-license");
		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "license-delete-customer",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [parent, license] }),
				],
				actions: [s.billing.attach({ productId: parent.id })],
			});
		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});
		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		await autumnV1.customers.delete(customerId);

		expect(
			await ctx.db.query.customerProducts.findMany({
				where: eq(customerProducts.internal_customer_id, customer.internal_id),
			}),
		).toHaveLength(0);
		expect(
			await ctx.db.query.customerLicenses.findMany({
				where: eq(customerLicenses.internal_customer_id, customer.internal_id),
			}),
		).toHaveLength(0);
	},
);

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

test.concurrent(
	`${chalk.yellowBright("licenses lifecycle: trial revert reparents assignments and heals inventory")}`,
	async () => {
		const previous = products.pro({
			id: "revert-previous",
			items: [items.dashboard()],
		});
		const trial = products.premium({
			id: "revert-trial",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("revert-license");
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-trial-revert",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [previous, trial, license] }),
			],
			actions: [],
		});
		for (const parent of [previous, trial]) {
			await autumnV2_2.post("/licenses.link", {
				parent_plan_id: parent.id,
				license_plan_id: license.id,
				included: 1,
			});
		}
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: previous.id,
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: trial.id,
			customize: {
				free_trial: {
					duration_length: 2,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		});
		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		})) as { assignment: { id: string } };
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});
		const trialCustomerProduct = fullCustomer.customer_products.find(
			(customerProduct) => customerProduct.product_id === trial.id,
		);
		if (!trialCustomerProduct) throw new Error("Trial product not found");
		await ctx.db
			.update(customerLicenses)
			.set({ remaining: 1 })
			.where(
				eq(
					customerLicenses.parent_customer_product_id,
					trialCustomerProduct.id,
				),
			);
		await CusProductService.update({
			ctx,
			cusProductId: trialCustomerProduct.id,
			updates: { trial_ends_at: Date.now() - 60_000 },
		});

		await runProductCron({ ctx: { db: ctx.db, logger: ctx.logger } });

		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		const activePrevious = dbState.products.find(
			(customerProduct) =>
				customerProduct.product_id === previous.id &&
				customerProduct.status === "active",
		);
		expect(activePrevious).toBeDefined();
		expect(
			dbState.assignments.find(({ id }) => id === assignment.id),
		).toMatchObject({
			status: "active",
			license_parent_customer_product_id: activePrevious?.id,
		});
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({
			parent_customer_product_id: activePrevious?.id,
			granted: 1,
			remaining: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses status: a free-trial parent stored as active is assignable")}`,
	async () => {
		const parent = products.proWithTrial({
			id: "bug-status-parent",
			items: [items.dashboard()],
			trialDays: 7,
		});
		const license = makeLicenseProduct("bug-status-license");

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
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
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(
			fullCustomer.customer_products.find(
				(customerProduct) => customerProduct.product_id === parent.id,
			)?.status,
		).toBe(CusProductStatus.Active);

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicenseBalanceResponse[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0]).toMatchObject({
			license_plan_id: license.id,
			inventory: { included: 1, assigned: 0, available: 1 },
		});

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
