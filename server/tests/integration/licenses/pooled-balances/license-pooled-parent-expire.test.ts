/**
 * Contract: canceling the license parent expires the license-keyed pool at
 * read time — same inherit-parent-liveness rule as seats.
 *
 *   cancel_immediately → Messages gone on get/check; getFull does not
 *     hydrate the pooled cusEnt for that link_id
 *   cancel one of two parents → only that link is unhydrated; remaining
 *     pool still grants
 *   re-attach → fresh link_id; expired pool stays hidden
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	LICENSE_POOLED_GRANT,
	expectLicensePooledBalanceExpired,
	expectLicensePooledEntitlementHydrated,
	expectLicensePooledEntitlementNotHydrated,
	parentPlan,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const cancelParentImmediately = async ({
	autumn,
	customerId,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
	planId: string;
}) => {
	await autumn.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: planId,
		cancel_action: "cancel_immediately",
	});
};

test.concurrent(
	`${chalk.yellowBright("license pooled: parent cancel expires the pool at read time")}`,
	async () => {
		const parent = parentPlan({ id: "lic-pool-exp-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-exp-seat",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-parent-expire";
		const { autumnV2_3, ctx } = await initScenario({
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

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});
		await expectLicensePooledEntitlementHydrated({
			ctx,
			customerId,
			customerLicenseLinkId,
		});

		await cancelParentImmediately({
			autumn: autumnV2_3,
			customerId,
			planId: parent.id,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		await expectCustomerProducts({
			customer,
			notPresent: [parent.id],
		});
		await expectLicensePooledBalanceExpired({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: canceling one of two parents expires only that pool")}`,
	async () => {
		const parentA = parentPlan({
			id: "lic-pool-exp-one-a",
			group: "lic-pool-exp-one-a",
		});
		const parentB = parentPlan({
			id: "lic-pool-exp-one-b",
			group: "lic-pool-exp-one-b",
		});
		const seatA = pooledSeatPlan({
			id: "lic-pool-exp-one-seat-a",
			item: pooledMonthlyMessages(),
		});
		const seatB = pooledSeatPlan({
			id: "lic-pool-exp-one-seat-b",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-parent-expire-one-of-two";
		const { autumnV2_3, ctx } = await initScenario({
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
		await expectLicensePooledEntitlementHydrated({
			ctx,
			customerId,
			customerLicenseLinkId: linkA,
		});
		await expectLicensePooledEntitlementHydrated({
			ctx,
			customerId,
			customerLicenseLinkId: linkB,
		});

		await cancelParentImmediately({
			autumn: autumnV2_3,
			customerId,
			planId: parentA.id,
		});

		await expectLicensePooledEntitlementNotHydrated({
			ctx,
			customerId,
			customerLicenseLinkId: linkA,
		});
		await expectLicensePooledEntitlementHydrated({
			ctx,
			customerId,
			customerLicenseLinkId: linkB,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			skipCache: true,
			featureId: TestFeature.Messages,
			granted: LICENSE_POOLED_GRANT,
			remaining: LICENSE_POOLED_GRANT,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: re-attach after cancel mints a fresh pool")}`,
	async () => {
		const parent = parentPlan({ id: "lic-pool-reattach-parent" });
		const seat = pooledSeatPlan({
			id: "lic-pool-reattach-seat",
			item: pooledMonthlyMessages(),
		});
		const customerId = "lic-pool-parent-reattach";
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
				s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
			],
		});

		const expiredLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});
		await expectLicensePooledEntitlementHydrated({
			ctx,
			customerId,
			customerLicenseLinkId: expiredLinkId,
		});

		await cancelParentImmediately({
			autumn: autumnV2_3,
			customerId,
			planId: parent.id,
		});
		await expectLicensePooledBalanceExpired({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId: expiredLinkId,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
		});
		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: [{ entity_id: entities[0].id }],
		});

		const liveLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});
		expect(liveLinkId).not.toBe(expiredLinkId);
		await expectLicensePooledEntitlementNotHydrated({
			ctx,
			customerId,
			customerLicenseLinkId: expiredLinkId,
		});
		await expectLicensePooledEntitlementHydrated({
			ctx,
			customerId,
			customerLicenseLinkId: liveLinkId,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			skipCache: true,
			featureId: TestFeature.Messages,
			granted: LICENSE_POOLED_GRANT,
			remaining: LICENSE_POOLED_GRANT,
			usage: 0,
		});
	},
);
