/**
 * Contract: lifetime license pools stay keyed by link_id. Two lifetime
 * licenses granting the same feature must not merge.
 *
 * Cases: 6, 7
 */

import { test } from "bun:test";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	LICENSE_POOLED_GRANT,
	lifetimeLicensePoolLifecycle,
	parentPlan,
	pooledLifetimeMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("license pooled: lifetime seat pool is keyed by link_id")}`,
	async () => {
		const parent = parentPlan({ id: "lic-pool-life-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-life-seat",
			item: pooledLifetimeMessages(),
		});
		const customerId = "lic-pool-lifetime";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 2,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0, 1],
				}),
			],
		});

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			filter: { customerLicenseLinkId },
			pool: {
				balance: LICENSE_POOLED_GRANT * 2,
				adjustment: 0,
				granted: LICENSE_POOLED_GRANT * 2,
				customerLicenseLinkId,
				...lifetimeLicensePoolLifecycle,
			},
			contributions: {
				count: 2,
				currentContribution: LICENSE_POOLED_GRANT,
			},
			sources: { count: 2, balance: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: two lifetime licenses of the same feature do not merge")}`,
	async () => {
		const parentA = parentPlan({
			id: "lic-pool-life-parent-a",
			group: "lic-pool-life-parent-a",
		});
		const parentB = parentPlan({
			id: "lic-pool-life-parent-b",
			group: "lic-pool-life-parent-b",
		});
		const seatA = pooledSeatPlan({
			id: "lic-pool-life-seat-a",
			item: pooledLifetimeMessages(),
		});
		const seatB = pooledSeatPlan({
			id: "lic-pool-life-seat-b",
			item: pooledLifetimeMessages(),
		});
		const customerId = "lic-pool-lifetime-two";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parentA, parentB, seatA, seatB] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parentA.id,
					licenseProductId: seatA.id,
					included: 1,
				}),
				s.licenses.link({
					parentProductId: parentB.id,
					licenseProductId: seatB.id,
					included: 1,
				}),
				s.billing.attach({ productId: parentA.id }),
				s.billing.attach({ productId: parentB.id }),
				s.licenses.assign({ licenseProductId: seatA.id, entityIndex: 0 }),
				s.licenses.assign({ licenseProductId: seatB.id, entityIndex: 1 }),
			],
		});

		const linkA = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatA.id,
		});
		const linkB = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatB.id,
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			filter: { customerLicenseLinkId: linkA },
			pool: {
				balance: LICENSE_POOLED_GRANT,
				adjustment: 0,
				granted: LICENSE_POOLED_GRANT,
				customerLicenseLinkId: linkA,
				...lifetimeLicensePoolLifecycle,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0 },
		});
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			filter: { customerLicenseLinkId: linkB },
			pool: {
				balance: LICENSE_POOLED_GRANT,
				adjustment: 0,
				granted: LICENSE_POOLED_GRANT,
				customerLicenseLinkId: linkB,
				...lifetimeLicensePoolLifecycle,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0 },
		});
	},
);
