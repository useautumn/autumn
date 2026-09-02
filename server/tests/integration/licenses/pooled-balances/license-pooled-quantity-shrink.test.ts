/**
 * Seat reductions must shrink the credit pool. Release keeps spare
 * contributions (rebind stays free); license_quantities must drop the
 * surplus so reset cannot re-sum them.
 *
 * Red (current):  billing.update license_quantities only writes
 *   paid_quantity — contribution count and pool granted stay at the old
 *   seat count after 5 → 3.
 * Green (after):  surplus unused seats expire and leave the pool; granted
 *   becomes paid + included immediately; reset stays at the new size.
 */

import { test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachLicenseParamsV0,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { PooledBalanceResetMode } from "@autumn/shared";
import { expirePooledBalanceForReset } from "@tests/integration/billing/pooled-balances/utils/expirePooledBalanceForReset.js";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	LICENSE_POOLED_GRANT,
	expectLicensePooledGrant,
	parentPlan,
	pooledMonthlyMessages,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const ATTACHED_SEATS = 5;
const SEAT_PRICE = 20;

const paidPooledSeat = ({ id, group }: { id: string; group: string }) =>
	products.base({
		id,
		group,
		items: [items.monthlyPrice({ price: SEAT_PRICE }), pooledMonthlyMessages()],
	});

const quantityShrinkScenario = async ({
	customerId,
	prefix,
	releaseIndexes,
}: {
	customerId: string;
	prefix: string;
	releaseIndexes: number[];
}) => {
	const parent = parentPlan({ id: `${prefix}-parent` });
	const seat = paidPooledSeat({
		id: `${prefix}-seat`,
		group: `${prefix}-seats`,
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: ATTACHED_SEATS, featureId: TestFeature.Users }),
			s.products({ list: [parent, seat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seat.id,
				included: 0,
			}),
			s.billing.attach({
				productId: parent.id,
				licenseQuantities: [
					{ licenseProductId: seat.id, quantity: ATTACHED_SEATS },
				],
			}),
			s.licenses.assign({
				licenseProductId: seat.id,
				entityIndexes: [0, 1, 2, 3, 4],
			}),
		],
	});

	if (releaseIndexes.length > 0) {
		await scenario.autumnV2_3.licenses.release({
			customer_id: customerId,
			license_plan_id: seat.id,
			entity_ids: releaseIndexes.map((index) => scenario.entities[index].id),
		});
	}

	const customerLicenseLinkId = await seatLinkId({
		db: scenario.ctx.db,
		customerId,
		licenseProductId: seat.id,
	});

	return { ...scenario, parent, seat, customerLicenseLinkId };
};

const updateLicenseQuantity = ({
	autumn,
	customerId,
	parentPlanId,
	licensePlanId,
	quantity,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
	parentPlanId: string;
	licensePlanId: string;
	quantity: number;
}) =>
	autumn.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: parentPlanId,
		license_quantities: [{ license_plan_id: licensePlanId, quantity }],
	});

test.concurrent(
	`${chalk.yellowBright("license pooled: qty 5 → 3 after release shrinks the pool; reset stays at 3")}`,
	async () => {
		const customerId = "lic-pool-qty-shrink";
		const { autumnV2_3, ctx, parent, seat, customerLicenseLinkId } =
			await quantityShrinkScenario({
				customerId,
				prefix: "lic-pool-qty-shrink",
				releaseIndexes: [0, 1],
			});

		await updateLicenseQuantity({
			autumn: autumnV2_3,
			customerId,
			parentPlanId: parent.id,
			licensePlanId: seat.id,
			quantity: 3,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					granted: 3,
					usage: 3,
					remaining: 0,
					paid_quantity: 3,
				},
			],
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_GRANT,
			seatCount: 3,
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
			grantPerSeat: LICENSE_POOLED_GRANT,
			seatCount: 3,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: qty 5 → 4 after release keeps one spare for rebind")}`,
	async () => {
		const customerId = "lic-pool-qty-keep-spare";
		const { autumnV2_3, ctx, entities, parent, seat, customerLicenseLinkId } =
			await quantityShrinkScenario({
				customerId,
				prefix: "lic-pool-qty-spare",
				releaseIndexes: [0, 1],
			});

		await updateLicenseQuantity({
			autumn: autumnV2_3,
			customerId,
			parentPlanId: parent.id,
			licensePlanId: seat.id,
			quantity: 4,
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_GRANT,
			seatCount: 4,
		});

		await autumnV2_3.licenses.attach<AttachLicenseParamsV0>({
			customer_id: customerId,
			plan_id: seat.id,
			entities: [{ entity_id: entities[0].id }],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					granted: 4,
					usage: 4,
					remaining: 0,
					paid_quantity: 4,
				},
			],
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_GRANT,
			seatCount: 4,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: grow after shrink mints new contributions, not reused zeros")}`,
	async () => {
		const customerId = "lic-pool-qty-regrow";
		const { autumnV2_3, ctx, entities, parent, seat, customerLicenseLinkId } =
			await quantityShrinkScenario({
				customerId,
				prefix: "lic-pool-qty-regrow",
				releaseIndexes: [0, 1],
			});

		await updateLicenseQuantity({
			autumn: autumnV2_3,
			customerId,
			parentPlanId: parent.id,
			licensePlanId: seat.id,
			quantity: 3,
		});
		await updateLicenseQuantity({
			autumn: autumnV2_3,
			customerId,
			parentPlanId: parent.id,
			licensePlanId: seat.id,
			quantity: 5,
		});

		await autumnV2_3.licenses.attach<AttachLicenseParamsV0>({
			customer_id: customerId,
			plan_id: seat.id,
			entities: [
				{ entity_id: entities[0].id },
				{ entity_id: entities[1].id },
			],
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_GRANT,
			seatCount: 5,
		});
	},
);
