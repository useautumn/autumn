/**
 * Contract: release and re-bind do not touch the pool. Spares keep
 * contributing; entity delete rides the release path.
 *
 * Cases: 10, 11, 12
 */

import { expect, test } from "bun:test";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	LICENSE_POOLED_GRANT,
	lazyLicensePoolLifecycle,
	parentPlan,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const livePoolId = async ({
	db,
	customerId,
	customerLicenseLinkId,
}: {
	db: DrizzleCli;
	customerId: string;
	customerLicenseLinkId: string;
}) => {
	const state = await getPooledBalanceDbState({ db, customerId });
	const pool = state.pools.find(
		(candidate) =>
			candidate.customer_license_link_id === customerLicenseLinkId &&
			(candidate.expires_at === null || candidate.expires_at > Date.now()),
	);
	if (!pool) {
		throw new Error(`No live pool for link ${customerLicenseLinkId}`);
	}
	return pool.id;
};

test.concurrent(
	`${chalk.yellowBright("license pooled: release keeps granted; rebind keeps the same pool")}`,
	async () => {
		const parent = parentPlan({ id: "lic-pool-release-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-release-seat",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-release-rebind";
		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 4, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 3,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});
		const poolIdBefore = await livePoolId({
			db: ctx.db,
			customerId,
			customerLicenseLinkId,
		});

		await autumnV2_3.licenses.release({
			customer_id: customerId,
			license_plan_id: seat.id,
			entity_ids: [entities[0].id],
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			filter: { customerLicenseLinkId },
			pool: {
				balance: LICENSE_POOLED_GRANT * 3,
				adjustment: 0,
				granted: LICENSE_POOLED_GRANT * 3,
				customerLicenseLinkId,
				...lazyLicensePoolLifecycle,
			},
			contributions: {
				count: 3,
				currentContribution: LICENSE_POOLED_GRANT,
			},
			sources: { count: 3, balance: 0 },
		});
		expect(
			await livePoolId({
				db: ctx.db,
				customerId,
				customerLicenseLinkId,
			}),
		).toBe(poolIdBefore);

		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: [{ entity_id: entities[3].id }],
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			filter: { customerLicenseLinkId },
			pool: {
				balance: LICENSE_POOLED_GRANT * 3,
				adjustment: 0,
				granted: LICENSE_POOLED_GRANT * 3,
				customerLicenseLinkId,
				...lazyLicensePoolLifecycle,
			},
			contributions: {
				count: 3,
				currentContribution: LICENSE_POOLED_GRANT,
			},
			sources: { count: 3, balance: 0 },
		});
		expect(
			await livePoolId({
				db: ctx.db,
				customerId,
				customerLicenseLinkId,
			}),
		).toBe(poolIdBefore);
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: entity delete is a release — pool stays")}`,
	async () => {
		const parent = parentPlan({ id: "lic-pool-entdel-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-entdel-seat",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-entity-delete";
		const { entities, autumnV2_3, ctx } = await initScenario({
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
		const poolIdBefore = await livePoolId({
			db: ctx.db,
			customerId,
			customerLicenseLinkId,
		});

		await autumnV2_3.entities.delete(customerId, entities[0].id);

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			filter: { customerLicenseLinkId },
			pool: {
				balance: LICENSE_POOLED_GRANT * 2,
				adjustment: 0,
				granted: LICENSE_POOLED_GRANT * 2,
				customerLicenseLinkId,
				...lazyLicensePoolLifecycle,
			},
			contributions: {
				count: 2,
				currentContribution: LICENSE_POOLED_GRANT,
			},
			sources: { count: 2, balance: 0 },
		});
		expect(
			await livePoolId({
				db: ctx.db,
				customerId,
				customerLicenseLinkId,
			}),
		).toBe(poolIdBefore);
	},
);
