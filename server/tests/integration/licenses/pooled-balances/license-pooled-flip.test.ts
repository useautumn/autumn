/**
 * Contract: same-feature pooledness or pool-identity changes are remove+add
 * (fresh grants, usage dropped). link_id is stable. Sources stay 0 when pooled.
 *
 *   immediate private→pooled → new pool, usage forgiven
 *   scheduled pooled→private → pool lives until activation, then fresh seats
 *   immediate monthly→lifetime → new lifetime pool, usage forgiven
 */

import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	LICENSE_POOLED_LOW_GRANT,
	expectLicensePooledBalanceExpired,
	expectLicensePooledGrant,
	expectLicensePrivateSeatGrant,
	lifetimeLicensePoolLifecycle,
	pooledLifetimeMessages,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const SEAT_COUNT = 3;
const USAGE = 50;

const flipPlans = ({ prefix }: { prefix: string }) => {
	const seatGroup = `${prefix}-seats`;
	return {
		pro: products.pro({
			id: `${prefix}-pro`,
			items: [items.dashboard()],
		}),
		premium: products.premium({
			id: `${prefix}-premium`,
			items: [items.dashboard()],
		}),
		seatPrivate: products.base({
			id: `${prefix}-seat-private`,
			items: [
				items.monthlyMessages({
					includedUsage: LICENSE_POOLED_LOW_GRANT,
				}),
			],
			group: seatGroup,
		}),
		seatPooled: pooledSeatPlan({
			id: `${prefix}-seat-pooled`,
			item: pooledMonthlyMessages({
				includedUsage: LICENSE_POOLED_LOW_GRANT,
			}),
			group: seatGroup,
		}),
		seatPooledLifetime: pooledSeatPlan({
			id: `${prefix}-seat-lifetime`,
			item: pooledLifetimeMessages({
				includedUsage: LICENSE_POOLED_LOW_GRANT,
			}),
			group: seatGroup,
		}),
	};
};

test.concurrent(
	`${chalk.yellowBright("license pooled: immediate private→pooled mints a fresh pool")}`,
	async () => {
		const { pro, premium, seatPrivate, seatPooled } = flipPlans({
			prefix: "lic-pool-flip-in",
		});
		const customerId = "lic-pool-flip-to-pooled";
		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({ list: [pro, premium, seatPrivate, seatPooled] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seatPrivate.id,
					included: SEAT_COUNT,
				}),
				s.licenses.link({
					parentProductId: premium.id,
					licenseProductId: seatPooled.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: pro.id }),
				s.licenses.assign({
					licenseProductId: seatPrivate.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatPrivate.id,
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

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		await expectCustomerProducts({ customer, active: [premium.id] });
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
	`${chalk.yellowBright("license pooled: scheduled pooled→private expires the pool at activation")}`,
	async () => {
		const { pro, premium, seatPrivate, seatPooled } = flipPlans({
			prefix: "lic-pool-flip-out",
		});
		const customerId = "lic-pool-flip-to-private";
		const { entities, autumnV2_3, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success", testClock: true }),
					s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
					s.products({ list: [pro, premium, seatPrivate, seatPooled] }),
				],
				actions: [
					s.licenses.link({
						parentProductId: pro.id,
						licenseProductId: seatPrivate.id,
						included: SEAT_COUNT,
					}),
					s.licenses.link({
						parentProductId: premium.id,
						licenseProductId: seatPooled.id,
						included: SEAT_COUNT,
					}),
					s.billing.attach({ productId: premium.id }),
					s.licenses.assign({
						licenseProductId: seatPooled.id,
						entityIndexes: [0, 1, 2],
					}),
				],
			});
		if (!testClockId) throw new Error("Test clock not enabled");

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatPooled.id,
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

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		const scheduled = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		await expectCustomerProducts({
			customer: scheduled,
			canceling: [premium.id],
			scheduled: [pro.id],
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
			usage: USAGE,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
		});

		const activated = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		await expectCustomerProducts({
			customer: activated,
			active: [pro.id],
			notPresent: [premium.id],
		});
		await expectLicensePooledBalanceExpired({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
		});
		await expectLicensePrivateSeatGrant({
			autumn: autumnV2_3,
			customerId,
			entityIds: entities.map((entity) => entity.id),
			grant: LICENSE_POOLED_LOW_GRANT,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: immediate monthly→lifetime mints a fresh identity")}`,
	async () => {
		const { pro, premium, seatPooled, seatPooledLifetime } = flipPlans({
			prefix: "lic-pool-flip-id",
		});
		const customerId = "lic-pool-flip-identity";
		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({
					list: [pro, premium, seatPooled, seatPooledLifetime],
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seatPooled.id,
					included: SEAT_COUNT,
				}),
				s.licenses.link({
					parentProductId: premium.id,
					licenseProductId: seatPooledLifetime.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: pro.id }),
				s.licenses.assign({
					licenseProductId: seatPooled.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatPooled.id,
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

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		await expectCustomerProducts({ customer, active: [premium.id] });
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
			usage: 0,
			lifecycle: lifetimeLicensePoolLifecycle,
		});
	},
);
