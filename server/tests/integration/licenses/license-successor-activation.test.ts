/**
 * When a scheduled paid downgrade target carries a license link, activating it
 * at cycle end must run the license reconcile hook: the activated parent's
 * pool appears in pools.list with the linked inventory.
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV0Input,
	CheckResponseV3,
	LicenseBalanceResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { getLicenseDbState } from "./licenseTestUtils.js";

const advanceToNextCycle = async ({
	stripeCli,
	testClockId,
	advancedTo,
}: {
	stripeCli: Parameters<typeof advanceTestClock>[0]["stripeCli"];
	testClockId?: string;
	advancedTo: number;
}) => {
	if (!testClockId) throw new Error("testClock not enabled");
	const cycleEnd = addMonths(new Date(advancedTo), 1);
	await advanceTestClock({
		stripeCli,
		testClockId,
		advanceTo: cycleEnd.getTime(),
		waitForSeconds: 30,
	});
	await advanceTestClock({
		stripeCli,
		testClockId,
		numberOfHours: hoursToFinalizeInvoice,
		startingFrom: cycleEnd,
		waitForSeconds: 30,
	});
};

const setupAssignedDowngrade = async ({
	customerId,
	successorOffersLicense,
}: {
	customerId: string;
	successorOffersLicense: boolean;
}) => {
	const premium = products.premium({
		id: "premium",
		items: [items.dashboard()],
	});
	const pro = products.pro({ id: "pro", items: [items.dashboard()] });
	const license = products.base({
		id: "seat",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [premium, pro, license] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	for (const parent of successorOffersLicense ? [premium, pro] : [premium]) {
		await scenario.autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
	}
	const { assignment } = (await scenario.autumnV2_2.post("/licenses.attach", {
		customer_id: customerId,
		entity_id: scenario.entities[0].id,
		plan_id: license.id,
	})) as { assignment: { id: string } };
	await scenario.autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});
	await timeout(4000);
	return { ...scenario, premium, pro, license, assignment };
};

test.concurrent(
	`${chalk.yellowBright("licenses successor activation: pool created when scheduled downgrade with license activates")}`,
	async () => {
		const premium = products.premium({
			id: "lic-act-premium",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const pro = products.pro({
			id: "lic-act-pro",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "lic-act-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { customerId, autumnV1, autumnV2_2, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "lic-successor-activation",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [premium, pro, license] }),
				],
				actions: [s.billing.attach({ productId: premium.id })],
			});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: pro.id,
			license_plan_id: license.id,
			included: 2,
		});

		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const scheduledPools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(scheduledPools.list).toHaveLength(0);

		await timeout(4000);
		await advanceToNextCycle({
			stripeCli: ctx.stripeCli,
			testClockId,
			advancedTo,
		});
		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({ granted: 2, remaining: 2 });

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0].inventory).toMatchObject({
			included: 2,
			assigned: 0,
			available: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses successor activation: scheduled downgrade re-parents an existing assignment")}`,
	async () => {
		const {
			customerId,
			entities,
			autumnV2_2,
			ctx,
			testClockId,
			advancedTo,
			premium,
			pro,
			assignment,
		} = await setupAssignedDowngrade({
			customerId: "lic-successor-reparent",
			successorOffersLicense: true,
		});

		const before = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(before.list).toHaveLength(1);
		expect(before.list[0]).toMatchObject({
			parent_plan_id: premium.id,
			inventory: { included: 1, assigned: 1, available: 0 },
		});

		await advanceToNextCycle({
			stripeCli: ctx.stripeCli,
			testClockId,
			advancedTo,
		});
		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		const activeParent = dbState.products.find(
			(customerProduct) =>
				customerProduct.product_id === pro.id &&
				customerProduct.status === "active" &&
				customerProduct.license_parent_customer_product_id === null,
		);
		expect(activeParent).toBeDefined();
		expect(
			dbState.assignments.find(({ id }) => id === assignment.id),
		).toMatchObject({
			status: "active",
			license_parent_customer_product_id: activeParent?.id,
		});
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({
			parent_customer_product_id: activeParent?.id,
			granted: 1,
			remaining: 0,
		});

		const after = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(after.list).toHaveLength(1);
		expect(after.list[0]).toMatchObject({
			parent_plan_id: pro.id,
			inventory: { included: 1, assigned: 1, available: 0 },
		});
		expect(after.list[0].assignments.map((item) => item.assignment_id)).toEqual(
			[assignment.id],
		);

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.allowed).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses successor activation: scheduled downgrade ends an unsupported assignment at activation")}`,
	async () => {
		const {
			customerId,
			entities,
			autumnV2_2,
			ctx,
			testClockId,
			advancedTo,
			license,
		} = await setupAssignedDowngrade({
			customerId: "lic-successor-unsupported",
			successorOffersLicense: false,
		});

		const before = (await autumnV2_2.post("/licenses.list_assignments", {
			customer_id: customerId,
			plan_id: license.id,
		})) as { list: unknown[] };
		expect(before.list).toHaveLength(1);

		await advanceToNextCycle({
			stripeCli: ctx.stripeCli,
			testClockId,
			advancedTo,
		});
		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(dbState.pools).toHaveLength(0);
		expect(dbState.assignments).toHaveLength(1);
		expect(dbState.assignments[0]).toMatchObject({ status: "expired" });

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(pools.list).toHaveLength(0);
		const assignments = (await autumnV2_2.post("/licenses.list_assignments", {
			customer_id: customerId,
			plan_id: license.id,
		})) as { list: unknown[] };
		expect(assignments.list).toHaveLength(0);

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.allowed).toBe(false);
	},
);
