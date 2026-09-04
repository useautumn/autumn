/**
 * Contract: license pools run the same runtime reset machinery as regular
 * pools. Overdue lazy license pools reset to seatCount × grant through reads;
 * rollover caps size off the pool grant; the reset cron selects the synthetic
 * row (never the seat sources). A dead parent hides the pool from reset.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	PooledBalanceResetMode,
	RolloverExpiryDurationType,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expirePooledBalanceForReset } from "@tests/integration/billing/pooled-balances/utils/expirePooledBalanceForReset.js";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { resetCustomerEntitlement } from "@/cron/resetCron/resetCustomerEntitlement.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getResetContextByIds } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import {
	expectLicensePooledGrant,
	LICENSE_POOLED_LOW_GRANT,
	parentPlan,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const SEAT_COUNT = 3;
const USAGE = 50;

const seatResetScenario = async ({
	customerId,
	prefix,
	rolloverConfig,
}: {
	customerId: string;
	prefix: string;
	rolloverConfig?: {
		max_percentage: number;
		length: number;
		duration: RolloverExpiryDurationType;
	};
}) => {
	const parent = parentPlan({ id: `${prefix}-parent` });
	const seatItem = rolloverConfig
		? {
				...items.monthlyMessagesWithRollover({
					includedUsage: LICENSE_POOLED_LOW_GRANT,
					rolloverConfig,
				}),
				pooled: true,
			}
		: pooledMonthlyMessages({ includedUsage: LICENSE_POOLED_LOW_GRANT });
	const seat = pooledSeatPlan({ id: `${prefix}-seat`, item: seatItem });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
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
	return { ...scenario, customerLicenseLinkId, parent };
};

test.concurrent(
	`${chalk.yellowBright("license pooled reset: overdue lazy license pool resets to seats × grant")}`,
	async () => {
		const customerId = "lic-pool-reset-lazy";
		const { autumnV2_3, ctx, entities, customerLicenseLinkId } =
			await seatResetScenario({
				customerId,
				prefix: "lic-pool-reset-lazy",
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
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled reset: rollover max_percentage sizes off the pool grant")}`,
	async () => {
		const customerId = "lic-pool-reset-rollover";
		const { autumnV2_3, ctx, entities } = await seatResetScenario({
			customerId,
			prefix: "lic-pool-reset-roll",
			rolloverConfig: {
				max_percentage: 50,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
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
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});

		// Pool grant = 600, cap = 300; unused 550 trims to 300. A per-seat cap
		// would wrongly stop at 100.
		const granted = LICENSE_POOLED_LOW_GRANT * SEAT_COUNT;
		const rolledOver = granted / 2;
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			skipCache: true,
			featureId: TestFeature.Messages,
			granted: granted + rolledOver,
			remaining: granted + rolledOver,
			usage: 0,
			rollovers: [{ balance: rolledOver }],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled reset: cron selects the synthetic pool row, never seat sources")}`,
	async () => {
		const customerId = "lic-pool-reset-cron";
		const { ctx } = await seatResetScenario({
			customerId,
			prefix: "lic-pool-reset-cron",
		});

		const { pool, pooledCustomerEntitlement } =
			await expirePooledBalanceForReset({
				ctx,
				customerId,
				resetMode: PooledBalanceResetMode.Lazy,
			});
		const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const sourceCustomerEntitlementIds = state.sourceCustomerProducts.flatMap(
			(customerProduct) =>
				customerProduct.customer_entitlements
					.filter(
						(customerEntitlement) => customerEntitlement.entitlement.pooled,
					)
					.map((customerEntitlement) => customerEntitlement.id),
		);
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: Date.now() - 1_000 })
			.where(inArray(customerEntitlements.id, sourceCustomerEntitlementIds));

		const resettable = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: Date.now(),
		});
		const resettableIds = resettable.map((candidate) => candidate.id);
		expect(resettableIds).toContain(pooledCustomerEntitlement.id);
		for (const sourceCustomerEntitlementId of sourceCustomerEntitlementIds) {
			expect(resettableIds).not.toContain(sourceCustomerEntitlementId);
		}

		const cronCustomerEntitlement = resettable.find(
			(candidate) => candidate.id === pooledCustomerEntitlement.id,
		);
		if (!cronCustomerEntitlement) {
			throw new Error("Expected cron to return the license pooled balance");
		}
		expect(cronCustomerEntitlement.pooled_balance?.id).toBe(pool.id);
		await resetCustomerEntitlement({
			ctx,
			cusEnt: cronCustomerEntitlement,
			updatedCusEnts: [],
		});

		const afterReset = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, pooledCustomerEntitlement.id),
		});
		expect(afterReset?.balance).toBe(LICENSE_POOLED_LOW_GRANT * SEAT_COUNT);
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled reset: dead-parent license pool is not reset")}`,
	async () => {
		const customerId = "lic-pool-reset-dead-parent";
		const { autumnV2_3, ctx, parent } = await seatResetScenario({
			customerId,
			prefix: "lic-pool-reset-dead-parent",
		});
		const { pooledCustomerEntitlement } = await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			cancel_action: "cancel_immediately",
		});

		const hydrated = await getResetContextByIds({
			db: ctx.db,
			customerEntitlementIds: [pooledCustomerEntitlement.id],
		});
		expect(hydrated.missingIds).toContain(pooledCustomerEntitlement.id);
		expect(hydrated.customerEntitlements).toHaveLength(0);

		const resettable = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: Date.now(),
		});
		expect(resettable.map((candidate) => candidate.id)).not.toContain(
			pooledCustomerEntitlement.id,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled reset: unassigned pool still resets to purchased × grant")}`,
	async () => {
		const customerId = "lic-pool-reset-unassigned";
		const parent = parentPlan({ id: "lic-pool-reset-unassigned-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-reset-unassigned-seat",
			item: pooledMonthlyMessages({ includedUsage: LICENSE_POOLED_LOW_GRANT }),
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});

		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
			contributionCount: 0,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled reset: one assigned of three still resets to purchased × grant")}`,
	async () => {
		const customerId = "lic-pool-reset-one-of-three";
		const parent = parentPlan({ id: "lic-pool-reset-one-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-reset-one-seat",
			item: pooledMonthlyMessages({ includedUsage: LICENSE_POOLED_LOW_GRANT }),
		});
		const { autumnV2_3, ctx, entities } = await initScenario({
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
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0],
				}),
			],
		});
		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
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
		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
			contributionCount: 1,
			usage: 0,
		});
	},
);
