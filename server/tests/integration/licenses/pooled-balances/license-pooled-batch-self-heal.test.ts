/**
 * Contract: the seat batch never creates a license pool itself. If the pool is
 * missing when seats transition, it re-runs billing's license pool step and
 * attaches seats to that pool — one live, funded pool, no 0-granted duplicate.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type CustomerLicenseTransition,
	type FullCustomerLicense,
	pooledBalances,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, isNull, sql } from "drizzle-orm";
import { batchTransition } from "@/internal/billing/v2/actions/batchTransition/batchTransition.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { generateId } from "@/utils/genUtils.js";
import {
	expectLicensePooledGrant,
	LICENSE_POOLED_ADDED_GRANT,
	LICENSE_POOLED_LOW_GRANT,
	pooledMonthlyMessages,
	pooledMonthlyWords,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const SEAT_COUNT = 3;

/** Same license, minus the words item — replaying it re-adds words to seats. */
const withoutFeature = ({
	customerLicense,
	featureId,
}: {
	customerLicense: FullCustomerLicense;
	featureId: string;
}): FullCustomerLicense => {
	const planLicense = customerLicense.planLicense;
	if (!planLicense) throw new Error("customer license missing planLicense");
	const removedEntitlementIds = new Set(
		planLicense.product.entitlements
			.filter((entitlement) => entitlement.feature_id === featureId)
			.map((entitlement) => entitlement.id),
	);
	return {
		...customerLicense,
		planLicense: {
			...planLicense,
			product: {
				...planLicense.product,
				entitlements: planLicense.product.entitlements.filter(
					(entitlement) => !removedEntitlementIds.has(entitlement.id),
				),
				prices: planLicense.product.prices.filter(
					(price) =>
						!price.entitlement_id ||
						!removedEntitlementIds.has(price.entitlement_id),
				),
			},
		},
	};
};

test.concurrent(
	`${chalk.yellowBright("license pooled: seat batch re-runs billing's pool step when the pool is missing")}`,
	async () => {
		const prefix = "lic-pool-self-heal";
		const pro = products.pro({
			id: `${prefix}-pro`,
			items: [items.dashboard()],
		});
		const premium = products.premium({
			id: `${prefix}-premium`,
			items: [items.dashboard()],
		});
		const seatMessages = pooledSeatPlan({
			id: `${prefix}-seat-messages`,
			item: pooledMonthlyMessages({ includedUsage: LICENSE_POOLED_LOW_GRANT }),
			group: `${prefix}-seats`,
		});
		const seatMessagesAndWords = pooledSeatPlan({
			id: `${prefix}-seat-messages-words`,
			items: [
				pooledMonthlyMessages({ includedUsage: LICENSE_POOLED_LOW_GRANT }),
				pooledMonthlyWords({ includedUsage: LICENSE_POOLED_ADDED_GRANT }),
			],
			group: `${prefix}-seats`,
		});
		const customerId = "lic-pool-self-heal";
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({
					list: [pro, premium, seatMessages, seatMessagesAndWords],
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seatMessages.id,
					included: SEAT_COUNT,
				}),
				s.licenses.link({
					parentProductId: premium.id,
					licenseProductId: seatMessagesAndWords.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: pro.id }),
				s.licenses.assign({
					licenseProductId: seatMessages.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});
		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatMessages.id,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		// ── Break it: expire the words pool and strip words from every seat ──
		const [wordsPool] = await ctx.db
			.select({ id: pooledBalances.id })
			.from(pooledBalances)
			.where(
				and(
					eq(pooledBalances.customer_license_link_id, customerLicenseLinkId),
					eq(
						pooledBalances.internal_feature_id,
						ctx.features.find((feature) => feature.id === TestFeature.Words)
							?.internal_id ?? "",
					),
					isNull(pooledBalances.expires_at),
				),
			);
		expect(wordsPool).toBeDefined();
		const expiredAt = Date.now();
		await ctx.db.execute(sql`
			DELETE FROM customer_entitlements
			WHERE pooled_contribution_id IN (
				SELECT id FROM pooled_balance_contributions
				WHERE pooled_balance_id = ${wordsPool.id}
			)
		`);
		await ctx.db.execute(sql`
			UPDATE customer_entitlements SET expires_at = ${expiredAt}
			WHERE pooled_balance_id = ${wordsPool.id} AND pooled_contribution_id IS NULL
		`);
		await ctx.db
			.update(pooledBalances)
			.set({ expires_at: expiredAt })
			.where(eq(pooledBalances.id, wordsPool.id));
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "license-pooled-batch-self-heal-test",
		});

		// ── Replay the seat batch directly: words is an add with no pool ──
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const incomingCustomerLicense = fullCustomer.customer_products
			.flatMap((customerProduct) => customerProduct.customer_licenses ?? [])
			.find(
				(customerLicense) => customerLicense.link_id === customerLicenseLinkId,
			);
		if (!incomingCustomerLicense) throw new Error("premium license not found");

		const transition: CustomerLicenseTransition = {
			outgoingCustomerLicense: withoutFeature({
				customerLicense: incomingCustomerLicense,
				featureId: TestFeature.Words,
			}),
			incomingCustomerLicense,
			updates: {
				linkId: customerLicenseLinkId,
				granted: incomingCustomerLicense.granted,
				remaining: incomingCustomerLicense.remaining,
				paidQuantity: incomingCustomerLicense.paid_quantity,
			},
			carryOverUsages: undefined,
		};
		await batchTransition({
			ctx: { ...ctx, customerId },
			transition,
			executionScope: {
				batchTransitionId: generateId("batch_transition"),
				assignmentCutoffMs: Date.now(),
			},
		});

		// One live words pool, funded by billing's rule, all seats contributing.
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_ADDED_GRANT,
			seatCount: SEAT_COUNT,
			featureId: TestFeature.Words,
		});
	},
);
