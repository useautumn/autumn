/**
 * Contract: assigning a pooled license seat mints one lazy pool keyed by
 * customer_licenses.link_id. N seats under that link are N contributions.
 *
 * Cases: 1, 8, 9, 17
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, CheckResponseV3 } from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import {
	LICENSE_POOLED_GRANT,
	lazyLicensePoolLifecycle,
	parentPlan,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("license pooled: assign 3 seats mints one lazy pool keyed by link_id")}`,
	async () => {
		const parent = parentPlan({ id: "lic-pool-basic-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-basic-seat",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-basic-assign";
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
				nextCycleContribution: LICENSE_POOLED_GRANT,
			},
			sources: { count: 3, balance: 0, adjustment: 0 },
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: LICENSE_POOLED_GRANT * 3,
			remaining: LICENSE_POOLED_GRANT * 3,
			usage: 0,
		});

		await autumnV2_3.track(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 80,
			},
			{ timeout: 2000 },
		);
		await autumnV2_3.track(
			{
				customer_id: customerId,
				entity_id: entities[3].id,
				feature_id: TestFeature.Messages,
				value: 20,
			},
			{ timeout: 2000 },
		);

		const afterTrack = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: afterTrack,
			featureId: TestFeature.Messages,
			granted: LICENSE_POOLED_GRANT * 3,
			remaining: LICENSE_POOLED_GRANT * 3 - 100,
			usage: 100,
		});

		const unassignedCheck = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[3].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(unassignedCheck.allowed).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: parent attach alone mints no pool; first assign does")}`,
	async () => {
		const parent = parentPlan({ id: "lic-pool-first-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-first-seat",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-first-assign";
		const { entities, autumnV2_3, ctx } = await initScenario({
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
			],
		});

		const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(before.pools).toHaveLength(0);
		expect(before.contributions).toHaveLength(0);

		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: [{ entity_id: entities[0].id }],
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
				balance: LICENSE_POOLED_GRANT,
				adjustment: 0,
				granted: LICENSE_POOLED_GRANT,
				customerLicenseLinkId,
				...lazyLicensePoolLifecycle,
			},
			contributions: {
				count: 1,
				currentContribution: LICENSE_POOLED_GRANT,
			},
			sources: { count: 1, balance: 0 },
		});
	},
);
