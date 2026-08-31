/**
 * Contract: license pools do not coalesce across link_ids. Two links granting
 * the same feature are two pools. A customer-level pooled item (null link)
 * stays a third identity.
 *
 * Cases: 2, 3, 4, 5
 */

import { test } from "bun:test";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	LICENSE_POOLED_GRANT,
	lazyLicensePoolLifecycle,
	parentPlan,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("license pooled: two licenses on one parent keep distinct link identities")}`,
	async () => {
		const parent = parentPlan({ id: "lic-pool-two-lic-parent" });
		const seatA = pooledSeatPlan({
			id: "lic-pool-two-lic-a",
			item: pooledMonthlyMessages(),
		});
		const seatB = pooledSeatPlan({
			id: "lic-pool-two-lic-b",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-two-licenses";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, seatA, seatB] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seatA.id,
					included: 1,
				}),
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seatB.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: seatA.id,
					entityIndex: 0,
				}),
				s.licenses.assign({
					licenseProductId: seatB.id,
					entityIndex: 1,
				}),
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
				...lazyLicensePoolLifecycle,
			},
			contributions: { count: 1, currentContribution: LICENSE_POOLED_GRANT },
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
				...lazyLicensePoolLifecycle,
			},
			contributions: { count: 1, currentContribution: LICENSE_POOLED_GRANT },
			sources: { count: 1, balance: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: two parents granting the same feature keep distinct link identities")}`,
	async () => {
		const parentA = parentPlan({
			id: "lic-pool-two-parent-a",
			group: "lic-pool-two-parent-a",
		});
		const parentB = parentPlan({
			id: "lic-pool-two-parent-b",
			group: "lic-pool-two-parent-b",
		});
		const seatA = pooledSeatPlan({
			id: "lic-pool-two-parent-seat-a",
			item: pooledMonthlyMessages(),
		});
		const seatB = pooledSeatPlan({
			id: "lic-pool-two-parent-seat-b",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-two-parents";
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
				...lazyLicensePoolLifecycle,
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
				...lazyLicensePoolLifecycle,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: customer-level pool and license pool do not coalesce")}`,
	async () => {
		const customerGrant = 200;
		const parent = products.base({
			id: "lic-pool-cus-level-parent",
			items: [
				items.dashboard(),
				{
					...items.monthlyMessages({ includedUsage: customerGrant }),
					pooled: true,
				},
			],
		});
		const seat = pooledSeatPlan({
			id: "lic-pool-cus-level-seat",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-customer-level";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
			],
		});

		const licenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			filter: { customerLicenseLinkId: null },
			pool: {
				balance: customerGrant,
				adjustment: 0,
				granted: customerGrant,
				customerLicenseLinkId: null,
				...lazyLicensePoolLifecycle,
			},
			contributions: { count: 1, currentContribution: customerGrant },
			sources: { count: 1, balance: 0 },
		});
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			filter: { customerLicenseLinkId: licenseLinkId },
			pool: {
				balance: LICENSE_POOLED_GRANT,
				adjustment: 0,
				granted: LICENSE_POOLED_GRANT,
				customerLicenseLinkId: licenseLinkId,
				...lazyLicensePoolLifecycle,
			},
			contributions: { count: 1, currentContribution: LICENSE_POOLED_GRANT },
			sources: { count: 1, balance: 0 },
		});
	},
);
