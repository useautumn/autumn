/**
 * Contract: license pools are what check/track read. Assigned, unassigned,
 * and customer-level checks all see seats × grant. Track deducts the pool
 * (source balances stay 0). Overage is denied.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	LICENSE_POOLED_LOW_GRANT,
	expectLicensePooledCheck,
	expectLicensePooledGrant,
	parentPlan,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const SEAT_COUNT = 3;
const USAGE = 50;

const checkTrackScenario = async ({
	customerId,
	prefix,
}: {
	customerId: string;
	prefix: string;
}) => {
	const parent = parentPlan({ id: `${prefix}-parent` });
	const seat = pooledSeatPlan({
		id: `${prefix}-seat`,
		item: pooledMonthlyMessages({ includedUsage: LICENSE_POOLED_LOW_GRANT }),
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: SEAT_COUNT + 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, seat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seat.id,
				included: SEAT_COUNT,
			}),
			s.billing.attach({ productId: parent.id }),
			s.licenses.assign({
				licenseProductId: seat.id,
				entityIndexes: [0, 1, 2],
			}),
		],
	});
	const customerLicenseLinkId = await seatLinkId({
		db: scenario.ctx.db,
		customerId,
		licenseProductId: seat.id,
	});
	return { ...scenario, customerLicenseLinkId };
};

test.concurrent(
	`${chalk.yellowBright("license pooled check: assigned, unassigned, and customer see the same pool")}`,
	async () => {
		const customerId = "lic-pool-check-subjects";
		const { autumnV2_3, entities } = await checkTrackScenario({
			customerId,
			prefix: "lic-pool-check-subjects",
		});
		const remaining = LICENSE_POOLED_LOW_GRANT * SEAT_COUNT;

		await expectLicensePooledCheck({
			autumn: autumnV2_3,
			customerId,
			allowed: true,
			remaining,
		});
		await expectLicensePooledCheck({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			allowed: true,
			remaining,
		});
		await expectLicensePooledCheck({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[3].id,
			allowed: true,
			remaining,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled track: deducts the pool, source balances stay 0")}`,
	async () => {
		const customerId = "lic-pool-track-pool";
		const { autumnV2_3, ctx, entities, customerLicenseLinkId } =
			await checkTrackScenario({
				customerId,
				prefix: "lic-pool-track-pool",
			});

		await autumnV2_3.track(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: USAGE,
			},
			{ timeout: 2000 },
		);

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
			usage: USAGE,
		});
		await expectLicensePooledCheck({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[3].id,
			allowed: true,
			remaining: LICENSE_POOLED_LOW_GRANT * SEAT_COUNT - USAGE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled check: overage against the pool is denied")}`,
	async () => {
		const customerId = "lic-pool-check-overage";
		const { autumnV2_3, entities } = await checkTrackScenario({
			customerId,
			prefix: "lic-pool-check-overage",
		});
		const granted = LICENSE_POOLED_LOW_GRANT * SEAT_COUNT;

		await autumnV2_3.track(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: granted,
			},
			{ timeout: 2000 },
		);

		await expectLicensePooledCheck({
			autumn: autumnV2_3,
			customerId,
			allowed: false,
			remaining: 0,
		});
	},
);
