/**
 * TDD tests for pooled balances never being minted when a plan is applied as a
 * DEFAULT rather than attached. Reported externally: a free parent linked to an
 * unpriced license plan (included: 1) carrying a pooled credit item works under
 * billing.attach, but not as a default.
 *
 * Red-failure mode (before the fix):
 *  - The customer gets its customer_licenses row with no pooled balance behind
 *    it, so the credit feature is absent from balances entirely and check is
 *    denied. Nothing repairs it afterwards.
 *
 * Green-success criteria:
 *  - Every path that applies a default plan computes the pooled balance
 *    transition, so the pool is minted exactly as billing.attach mints it.
 *
 * The plan builders own this: executeAutumnBillingPlan already calls
 * executePooledBalancePlan, which no-ops on an undefined pooledBalancePlan.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectLicensePooledGrant,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

// The reported shape: one included seat granting a 600-credit monthly pool.
const POOLED_GRANT = 600;
const INCLUDED_SEATS = 1;

/**
 * Free parent carrying no credit item, linked to the license plan holding the
 * pool. The link has to exist before the customer under test is created, so the
 * scenario's own customer only seeds the catalog and the real one comes after.
 */
const seedDefaultPlan = async ({ prefix }: { prefix: string }) => {
	const seatPlan = pooledSeatPlan({
		id: `${prefix}-seat`,
		item: pooledMonthlyMessages({ includedUsage: POOLED_GRANT }),
		group: `${prefix}-seats`,
	});
	const parent = products.base({
		id: `${prefix}-parent`,
		items: [items.dashboard()],
		isDefault: true,
	});
	const seedCustomerId = `${prefix}-seed`;

	const { autumnV2_3, ctx } = await initScenario({
		customerId: seedCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [parent, seatPlan] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seatPlan.id,
				included: INCLUDED_SEATS,
			}),
		],
	});

	return { autumnV2_3, ctx, parent, seatPlan, defaultGroup: seedCustomerId };
};

/** Deterministic ids survive a failed run; a stale row would mask the default path. */
const resetCustomer = async ({
	autumn,
	customerId,
}: {
	autumn: AutumnInt;
	customerId: string;
}) => {
	await autumn.customers.delete(customerId).catch(() => undefined);
};

const expectDefaultedPool = async ({
	autumn,
	ctx,
	customerId,
	seatPlanId,
	usage = 0,
}: {
	autumn: AutumnInt;
	ctx: Awaited<ReturnType<typeof seedDefaultPlan>>["ctx"];
	customerId: string;
	seatPlanId: string;
	usage?: number;
}) => {
	const customerLicenseLinkId = await seatLinkId({
		db: ctx.db,
		customerId,
		licenseProductId: seatPlanId,
	});
	// No seat is assigned yet, so the pool has its grant but no contribution
	// sources — the same state billing.attach leaves behind.
	await expectLicensePooledGrant({
		autumn,
		ctx,
		customerId,
		customerLicenseLinkId,
		grantPerSeat: POOLED_GRANT,
		seatCount: INCLUDED_SEATS,
		contributionCount: 0,
		usage,
	});
};

test.concurrent(
	`${chalk.yellowBright("license pooled: auto_enable_plan_id mints the pool on customer creation")}`,
	async () => {
		const prefix = "lic-pool-default-auto";
		const customerId = `${prefix}-customer`;
		const { autumnV2_3, ctx, parent, seatPlan } = await seedDefaultPlan({
			prefix,
		});

		// The reported reproduction: no attach call, the plan is named as a default.
		await resetCustomer({ autumn: autumnV2_3, customerId });
		await autumnV2_3.customers.create({
			id: customerId,
			auto_enable_plan_id: parent.id,
		});

		await expectDefaultedPool({
			autumn: autumnV2_3,
			ctx,
			customerId,
			seatPlanId: seatPlan.id,
		});

		const { allowed } = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(allowed).toBe(true);

		// The attached path is the reference the report compared against; the
		// same assertions passing on both is what proves the default matches it.
		const attachedCustomerId = `${prefix}-attached`;
		await resetCustomer({ autumn: autumnV2_3, customerId: attachedCustomerId });
		await autumnV2_3.customers.create({ id: attachedCustomerId });
		await autumnV2_3.billing.attach({
			customer_id: attachedCustomerId,
			plan_id: parent.id,
		});
		await expectDefaultedPool({
			autumn: autumnV2_3,
			ctx,
			customerId: attachedCustomerId,
			seatPlanId: seatPlan.id,
		});
	},
	{ timeout: 240_000 },
);

test.concurrent(
	`${chalk.yellowBright("license pooled: a group default mints the pool on customer creation")}`,
	async () => {
		const prefix = "lic-pool-default-group";
		const customerId = `${prefix}-customer`;
		const { autumnV2_3, ctx, seatPlan, defaultGroup } = await seedDefaultPlan({
			prefix,
		});

		// Same builder as auto_enable_plan_id, reached through the group default.
		await resetCustomer({ autumn: autumnV2_3, customerId });
		await autumnV2_3.customers.create({
			id: customerId,
			internalOptions: { disable_defaults: false, default_group: defaultGroup },
		});

		await expectDefaultedPool({
			autumn: autumnV2_3,
			ctx,
			customerId,
			seatPlanId: seatPlan.id,
		});
	},
	{ timeout: 240_000 },
);

test.concurrent(
	`${chalk.yellowBright("license pooled: a defaulted pool deducts on track, matching an attached one")}`,
	async () => {
		const prefix = "lic-pool-default-track";
		const customerId = `${prefix}-customer`;
		const USED = 100;
		const { autumnV2_3, ctx, parent, seatPlan } = await seedDefaultPlan({
			prefix,
		});

		await resetCustomer({ autumn: autumnV2_3, customerId });
		await autumnV2_3.customers.create({
			id: customerId,
			auto_enable_plan_id: parent.id,
		});
		await autumnV2_3.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: USED,
			},
			{ timeout: 3_000 },
		);

		await expectDefaultedPool({
			autumn: autumnV2_3,
			ctx,
			customerId,
			seatPlanId: seatPlan.id,
			usage: USED,
		});
	},
	{ timeout: 240_000 },
);
