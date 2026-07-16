import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	CheckResponseV3,
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
import {
	getLicenseDbState,
	listLicenseAssignments,
	listLicensePools,
} from "./licenseTestUtils.js";

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
				actions: [
					s.licenses.link({
						parentProductId: parent.id,
						licenseProductId: license.id,
						included: 1,
					}),
					s.billing.attach({ productId: parent.id }),
					s.licenses.assign({
						licenseProductId: license.id,
						entityIndex: 0,
					}),
				],
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

		const assignmentsAfterCancel = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		const openAssignments = assignmentsAfterCancel.filter(
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
				actions: [
					...[proPlan, premiumPlan].map((parent) =>
						s.licenses.link({
							parentProductId: parent.id,
							licenseProductId: license.id,
							included: 1,
						}),
					),
					s.billing.attach({ productId: proPlan.id }),
					s.licenses.assign({
						licenseProductId: license.id,
						entityIndex: 0,
					}),
				],
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

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
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

		const poolsAfterUpgrade = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
		});
		expect(poolsAfterUpgrade).toHaveLength(1);
		expect(poolsAfterUpgrade[0]).toMatchObject({
			license_plan_id: license.id,
			granted: 1,
			usage: 1,
			remaining: 0,
		});
		const assignmentsAfterUpgrade = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			active: true,
		});
		expect(assignmentsAfterUpgrade).toHaveLength(1);
		expect(assignmentsAfterUpgrade[0]).toMatchObject({
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
				actions: [
					s.licenses.link({
						parentProductId: parent.id,
						licenseProductId: license.id,
						included: 1,
					}),
					s.billing.attach({ productId: parent.id }),
					s.licenses.assign({
						licenseProductId: license.id,
						entityIndex: 0,
					}),
				],
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

		const assignmentsAfter = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		const openAssignments = assignmentsAfter.filter(
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

		const {
			customerId,
			entities,
			autumnV2_2,
			ctx,
			testClockId,
			advancedTo,
			licenseAssignments: [assignment],
		} = await initScenario({
			customerId: "license-lifecycle-eoc",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: license.id,
					entityIndex: 0,
				}),
			],
		});

		const updateCancellation = (
			cancelAction: "cancel_end_of_cycle" | "uncancel",
		) =>
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: parent.id,
				cancel_action: cancelAction,
			});
		const expectAssignmentOpen = async () => {
			const assignments = await listLicenseAssignments({
				autumn: autumnV2_2,
				customerId,
				licensePlanId: license.id,
			});
			expect(assignments).toEqual([
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

		const assignmentsAfter = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			licensePlanId: license.id,
		});
		expect(assignmentsAfter).toHaveLength(0);
		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.allowed).toBe(false);
	},
);
