import {
	AllowanceType,
	addCusProductToCusEnt,
	EntInterval,
	getStartingBalance,
	isCustomerEntitlementPrepaidWithSeparateResetInterval,
	type ResetCusEnt,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format } from "date-fns";
import type { RepoContext } from "@/db/repoContext";
import { resolveCustomerRedisRouting } from "@/external/redis/customerRedisRouting.js";
import type { OrgWithRedisConfig } from "@/external/redis/orgRedisPool.js";
import { invalidateCustomerEntitlementBalance } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateCustomerEntitlementBalance.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { getNextResetAt } from "@/utils/timeUtils.js";
import type { CronContext } from "../utils/CronContext";
import { getStripeSubscriptionAnchor } from "./getStripeSubscriptionAnchor";
import { resetShortDurationCustomerEntitlement } from "./resetShortDurationCustomerEntitlement";

const shortDurations = [EntInterval.Minute, EntInterval.Hour, EntInterval.Day];

const resetCustomerEntitlementInDb = async ({
	ctx,
	org,
	cusEnt,
	updatedCusEnts,
	persistFreeOverage = false,
}: {
	ctx: CronContext;
	org: OrgWithRedisConfig;
	cusEnt: ResetCusEnt;
	updatedCusEnts: ResetCusEnt[];
	persistFreeOverage?: boolean;
}) => {
	const redisRouting = resolveCustomerRedisRouting({
		org,
		customerId: cusEnt.customer_id ?? "",
	});
	const repoContext: RepoContext = {
		db: ctx.db,
		logger: ctx.logger,
		org: {
			id: cusEnt.customer.org_id,
		},
		env: cusEnt.customer.env,
		customerId: cusEnt.customer_id ?? "",
		redisV2: redisRouting.redis,
	};

	try {
		const ent = cusEnt.entitlement;
		const shortDurationInterval = ent.interval;

		if (
			ent.allowance_type === AllowanceType.Fixed &&
			shortDurationInterval &&
			shortDurations.includes(shortDurationInterval)
		) {
			return await resetShortDurationCustomerEntitlement({
				ctx: repoContext,
				cusEnt,
				updatedCusEnts,
			});
		}

		// Fetch related price. Normal paid entitlements reset from
		// invoice.created; split prepaid reset intervals reset here.
		let relatedCusPrice = null;
		if (cusEnt.customer_product_id) {
			const cusPrices = await CusPriceService.getByCustomerProductId({
				db: ctx.db,
				customerProductId: cusEnt.customer_product_id,
			});
			relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);
			const customerEntitlementWithPrices = cusEnt.customer_product
				? addCusProductToCusEnt({
						cusEnt,
						cusProduct: {
							...cusEnt.customer_product,
							customer_prices: cusPrices,
						},
					})
				: null;
			const resetsViaInvoice =
				(cusEnt.customer_product?.subscription_ids?.length ?? 0) > 0;
			if (
				resetsViaInvoice &&
				relatedCusPrice &&
				(!customerEntitlementWithPrices ||
					!isCustomerEntitlementPrepaidWithSeparateResetInterval({
						customerEntitlement: customerEntitlementWithPrices,
						customerPrice: relatedCusPrice,
					}))
			) {
				return;
			}
		}

		const entOptions = getEntOptions(
			cusEnt.customer_product?.options ?? [],
			cusEnt.entitlement,
		);

		// Handle if entitlement changed to unlimited...
		const entitlement = cusEnt.entitlement;
		if (entitlement.allowance_type === AllowanceType.Unlimited) {
			await CusEntService.update({
				ctx: repoContext,
				id: cusEnt.id,
				updates: {
					unlimited: true,
					next_reset_at: null,
				},
			});

			console.log(
				`Reset ${cusEnt.id} | customer: ${cusEnt.customer_id} | feature: ${cusEnt.feature_id} | new balance: unlimited`,
			);
			return;
		}

		if (entitlement.interval === EntInterval.Lifetime) {
			await CusEntService.update({
				ctx: repoContext,
				id: cusEnt.id,
				updates: {
					next_reset_at: null,
				},
			});

			console.log(
				`Reset ${cusEnt.id} | customer: ${cusEnt.customer_id} | feature: ${cusEnt.feature_id} | reset to lifetime (next_reset_at: null)`,
			);
			return;
		}

		const resetBalance = getStartingBalance({
			entitlement: cusEnt.entitlement,
			options: entOptions || undefined,
			relatedPrice: relatedCusPrice?.price,
			productQuantity: cusEnt.customer_product?.quantity ?? 1,
		});

		if (!cusEnt.next_reset_at) return;
		const resetInterval = cusEnt.entitlement.interval;
		if (!resetInterval) return;

		// 1. Check if should reset
		let nextResetAt = getNextResetAt({
			curReset: new UTCDate(cusEnt.next_reset_at),
			interval: resetInterval,
			intervalCount: cusEnt.entitlement.interval_count,
		});

		const rolloverUpdate = getRolloverUpdates({
			cusEnt,
			nextResetAt: cusEnt.next_reset_at,
		});

		const resetBalanceUpdate = getResetBalancesUpdate({
			cusEnt,
			allowance: resetBalance || undefined,
			persistFreeOverage,
		});

		// Only check sub anchor for product-based ents (loose ents have no subscription)
		if (cusEnt.customer_product) {
			try {
				nextResetAt = await getStripeSubscriptionAnchor({
					db: ctx.db,
					cusEnt,
					curResetAt: cusEnt.next_reset_at,
					nextResetAt,
				});
			} catch (error) {
				console.log(
					`WARNING: Failed to check sub anchor: ${error}, Org: ${cusEnt.customer.org_id}`,
				);
				console.log(error);
			}
		}

		await CusEntService.update({
			ctx: repoContext,
			id: cusEnt.id,
			updates: {
				...resetBalanceUpdate,
				next_reset_at: nextResetAt,
				adjustment: 0,
			},
		});

		if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
			// The cron loader hands us cusEnt.rollovers as [], so load the live
			// set before insert lets clearExcessRollovers enforce the cap.
			const existingRollovers = await RolloverService.getCurrentRollovers({
				ctx: repoContext,
				cusEntID: cusEnt.id,
			});
			await RolloverService.insert({
				ctx: repoContext,
				rows: rolloverUpdate.toInsert,
				fullCusEnt: { ...cusEnt, rollovers: existingRollovers },
			});
		}

		updatedCusEnts.push(cusEnt);

		console.log(
			`Reset ${cusEnt.id} | customer: ${cusEnt.customer_id} | feature: ${cusEnt.feature_id} | new balance: ${resetBalance} | new next_reset_at: ${format(new UTCDate(nextResetAt), "dd MMM yyyy HH:mm:ss")}`,
		);
	} catch (error) {
		console.log(
			`Failed to reset ${cusEnt.id} | ${cusEnt.customer_id} | ${cusEnt.feature_id}, error: ${error}`,
		);
	}
};

export const resetCustomerEntitlement = async ({
	ctx,
	org,
	cusEnt,
	updatedCusEnts,
	persistFreeOverage = false,
}: {
	ctx: CronContext;
	org?: OrgWithRedisConfig;
	cusEnt: ResetCusEnt;
	updatedCusEnts: ResetCusEnt[];
	persistFreeOverage?: boolean;
}) => {
	const routingOrg = org ?? { id: cusEnt.customer.org_id, redis_config: null };
	const redisRouting = resolveCustomerRedisRouting({
		org: routingOrg,
		customerId: cusEnt.customer_id ?? "",
	});
	const result = await resetCustomerEntitlementInDb({
		ctx,
		org: routingOrg,
		cusEnt,
		updatedCusEnts,
		persistFreeOverage,
	});
	await invalidateCustomerEntitlementBalance({
		orgId: cusEnt.customer.org_id,
		env: cusEnt.customer.env,
		customerId: cusEnt.customer_id ?? "",
		featureId: cusEnt.entitlement.feature.id,
		customerEntitlementId: cusEnt.id,
		redisV2: redisRouting.redis,
	});
	return result;
};
