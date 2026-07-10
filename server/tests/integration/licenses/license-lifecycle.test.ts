/**
 * TDD tests for license assignment lifecycle on parent plan transitions.
 *
 * Red-failure mode (current behavior):
 *  - Cancelling the parent subscription leaves assignments open (ended_at null)
 *    and provisioned license customer products Active, so entities keep access.
 *  - A plain upgrade (no license patch) leaves active assignments pointed
 *    at the expired parent's pools; the new parent's pool reports assigned=0.
 *
 * Green-success criteria (after fix):
 *  - Cancel immediately ends active assignments and expires provisioned
 *    license customer products; entity checks stop granting the license.
 *  - Plain upgrade re-parents active assignments onto the successor's pools;
 *    inventory counts and entity access carry over.
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	CheckResponseV3,
	LicenseBalanceResponse,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { runProductCron } from "@/cron/productCron/runProductCron.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getLicenseDbState } from "./licenseTestUtils.js";

const makeLicenseProduct = (id: string) => ({
	...products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("licenses-lifecycle: cancelling the parent ends assignments and revokes entity access")}`,
	async () => {
		const parent = products.pro({
			id: "lifecycle-cancel-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("lifecycle-cancel-license");

		const { customerId, entities, autumnV2_1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "license-lifecycle-cancel",
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
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const beforeCancel = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(beforeCancel.allowed).toBe(true);

		await autumnV2_2.billing.update({
			customer_id: customerId,
			plan_id: parent.id,
			cancel_action: "cancel_immediately",
		});
		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(dbState.pools).toHaveLength(0);
		expect(dbState.assignments).toHaveLength(1);
		expect(dbState.assignments[0]).toMatchObject({ status: "expired" });

		const assignmentsAfterCancel = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: license.id,
			},
		)) as { list: Array<{ ended_at: number | null }> };
		const openAssignments = assignmentsAfterCancel.list.filter(
			(assignment) => assignment.ended_at === null,
		);
		expect(openAssignments).toHaveLength(0);

		for (const skipCache of [false, true]) {
			const afterCancel = await autumnV2_1.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				skip_cache: skipCache,
			});
			expect(afterCancel.allowed).toBe(false);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-lifecycle: plain upgrade re-parents assignments onto the new plan's pools")}`,
	async () => {
		const proPlan = products.pro({
			id: "lifecycle-upgrade-pro",
			items: [items.dashboard()],
		});
		const premiumPlan = products.premium({
			id: "lifecycle-upgrade-premium",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("lifecycle-upgrade-license");

		const { customerId, entities, autumnV2_1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "license-lifecycle-upgrade",
				setup: [
					s.customer({ paymentMethod: "success", testClock: false }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [proPlan, premiumPlan, license] }),
				],
				actions: [],
			});

		for (const planId of [proPlan.id, premiumPlan.id]) {
			await autumnV2_2.post("/licenses.link", {
				parent_plan_id: planId,
				license_plan_id: license.id,
				included: 1,
			});
		}
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: proPlan.id,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});
		expect(
			(
				await autumnV2_1.check<CheckResponseV3>({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
				})
			).allowed,
		).toBe(true);

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premiumPlan.id,
		});
		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		const activeParent = dbState.products.find(
			(customerProduct) =>
				customerProduct.product_id === premiumPlan.id &&
				customerProduct.status === "active",
		);
		expect(activeParent).toBeDefined();
		expect(dbState.assignments[0]).toMatchObject({
			status: "active",
			license_parent_customer_product_id: activeParent?.id,
		});
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({
			parent_customer_product_id: activeParent?.id,
			granted: 1,
			remaining: 0,
		});

		const poolsAfterUpgrade = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsAfterUpgrade.list).toHaveLength(1);
		expect(poolsAfterUpgrade.list[0]).toMatchObject({
			license_plan_id: license.id,
			inventory: {
				included: 1,
				assigned: 1,
				available: 0,
			},
		});
		expect(poolsAfterUpgrade.list[0].assignments).toHaveLength(1);
		expect(poolsAfterUpgrade.list[0].assignments[0]).toMatchObject({
			entity_id: entities[0].id,
			license_plan_id: license.id,
		});

		for (const skipCache of [false, true]) {
			const afterUpgrade = await autumnV2_1.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				skip_cache: skipCache,
			});
			expect(afterUpgrade.allowed).toBe(true);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-lifecycle: trial expiry ends assignments on a license parent")}`,
	async () => {
		const parent = products.baseWithTrial({
			id: "lifecycle-trial-parent",
			items: [items.dashboard()],
			trialDays: 7,
		});
		const license = makeLicenseProduct("lifecycle-trial-license");

		const { customerId, entities, ctx, autumnV2_1, autumnV2_2 } =
			await initScenario({
				customerId: "license-lifecycle-trial",
				setup: [
					s.customer({ testClock: false }),
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
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const beforeExpiry = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(beforeExpiry.allowed).toBe(true);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const trialParent = fullCustomer.customer_products.find(
			(customerProduct) => customerProduct.product.id === parent.id,
		);
		if (!trialParent) throw new Error("trial parent not found");
		await CusProductService.update({
			ctx,
			cusProductId: trialParent.id,
			updates: { trial_ends_at: Date.now() - 60_000 },
		});
		await runProductCron({ ctx: { db: ctx.db, logger: ctx.logger } });
		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(dbState.pools).toHaveLength(0);
		expect(dbState.assignments).toHaveLength(1);
		expect(dbState.assignments[0]).toMatchObject({ status: "expired" });

		const assignmentsAfter = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: license.id,
			},
		)) as { list: Array<{ ended_at: number | null }> };
		const openAssignments = assignmentsAfter.list.filter(
			(assignment) => assignment.ended_at === null,
		);
		expect(openAssignments).toHaveLength(0);

		const afterExpiry = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(afterExpiry.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-lifecycle: end-of-cycle cancel and uncancel preserve assignments until expiry")}`,
	async () => {
		const parent = products.pro({
			id: "lifecycle-eoc-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("lifecycle-eoc-license");

		const { customerId, entities, autumnV2_2, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "license-lifecycle-eoc",
				setup: [
					s.customer({ paymentMethod: "success" }),
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
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
		});
		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		})) as { assignment: { id: string } };

		const updateCancellation = (
			cancelAction: "cancel_end_of_cycle" | "uncancel",
		) =>
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: parent.id,
				cancel_action: cancelAction,
			});
		const expectAssignmentOpen = async () => {
			const assignments = (await autumnV2_2.post("/licenses.list_assignments", {
				customer_id: customerId,
				plan_id: license.id,
			})) as { list: Array<{ id: string; ended_at: number | null }> };
			expect(assignments.list).toEqual([
				expect.objectContaining({ id: assignment.id, ended_at: null }),
			]);
		};

		await updateCancellation("cancel_end_of_cycle");
		await expectAssignmentOpen();
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await updateCancellation("uncancel");
		await expectAssignmentOpen();
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await updateCancellation("cancel_end_of_cycle");
		await expectAssignmentOpen();
		if (!testClockId) throw new Error("testClock not enabled");
		const cycleEnd = addMonths(new Date(advancedTo), 1);
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: cycleEnd.getTime(),
			waitForSeconds: 30,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			numberOfHours: hoursToFinalizeInvoice,
			startingFrom: cycleEnd,
			waitForSeconds: 30,
		});
		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(dbState.pools).toHaveLength(0);
		expect(dbState.assignments).toHaveLength(1);
		expect(dbState.assignments[0]).toMatchObject({ status: "expired" });

		const assignmentsAfter = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				plan_id: license.id,
			},
		)) as { list: unknown[] };
		expect(assignmentsAfter.list).toHaveLength(0);
		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.allowed).toBe(false);
	},
);
