import {
	AllowanceType,
	EntInterval,
	type FullEntitlement,
	getStartingBalance,
	type ResetCusEnt,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format } from "date-fns";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { getNextResetAt } from "@/utils/timeUtils.js";
import { getStripeSubscriptionAnchor } from "./getStripeSubscriptionAnchor";
import { resetShortDurationCustomerEntitlement } from "./resetShortDurationCustomerEntitlement";

const shortDurations = [EntInterval.Minute, EntInterval.Hour, EntInterval.Day];

export const resetCustomerEntitlement = async ({
	db,
	cusEnt,
	updatedCusEnts,
}: {
	db: DrizzleCli;
	cusEnt: ResetCusEnt;
	updatedCusEnts: ResetCusEnt[];
}) => {
	try {
		const ent = cusEnt.entitlement as FullEntitlement;

		if (
			ent.allowance_type === AllowanceType.Fixed &&
			shortDurations.includes(ent.interval as EntInterval)
		) {
			return await resetShortDurationCustomerEntitlement({
				db,
				cusEnt,
				updatedCusEnts,
			});
		}

		// Fetch related price (skip for loose ents)
		let relatedCusPrice = null;
		if (cusEnt.customer_product_id) {
			const cusPrices = await CusPriceService.getByCustomerProductId({
				db,
				customerProductId: cusEnt.customer_product_id,
			});
			relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);
			if (relatedCusPrice) {
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
				db,
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
				db,
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
			relatedPrice: undefined,
			productQuantity: cusEnt.customer_product?.quantity ?? 1,
		});

		if (!cusEnt.next_reset_at) return;

		// 1. Check if should reset
		let nextResetAt = getNextResetAt({
			curReset: new UTCDate(cusEnt.next_reset_at),
			interval: cusEnt.entitlement.interval as EntInterval,
			intervalCount: cusEnt.entitlement.interval_count,
		});

		const rolloverUpdate = getRolloverUpdates({
			cusEnt,
			nextResetAt: cusEnt.next_reset_at,
		});

		const resetBalanceUpdate = getResetBalancesUpdate({
			cusEnt,
			allowance: resetBalance || undefined,
		});

		// Only check sub anchor for product-based ents (loose ents have no subscription)
		if (cusEnt.customer_product) {
			try {
				nextResetAt = await getStripeSubscriptionAnchor({
					db,
					cusEnt,
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
			db,
			id: cusEnt.id,
			updates: {
				...resetBalanceUpdate,
				next_reset_at: nextResetAt,
				adjustment: 0,
			},
		});

		if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
			await RolloverService.insert({
				db,
				rows: rolloverUpdate.toInsert,
				fullCusEnt: cusEnt,
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
