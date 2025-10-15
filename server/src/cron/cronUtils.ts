import {
	AllowanceType,
	type AppEnv,
	EntInterval,
	type FullCusEntWithProduct,
	type FullEntitlement,
	getStartingBalance,
	type Organization,
	type ResetCusEnt,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import chalk from "chalk";
import { format, getDate, getMonth, setDate } from "date-fns";
import { Decimal } from "decimal.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { getNextResetAt } from "@/utils/timeUtils.js";
import type { DrizzleCli } from "../db/initDrizzle.js";
import { RolloverService } from "../internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";

const checkSubAnchor = async ({
	db,
	cusEnt,
	nextResetAt,
}: {
	db: DrizzleCli;
	cusEnt: FullCusEntWithProduct;
	nextResetAt: number;
}) => {
	let nextResetAtDate = new UTCDate(nextResetAt);

	// If nextResetAt is on the 28th of March, or Day 30, then do this check.
	const nextResetAtDay = getDate(nextResetAtDate);
	const nextResetAtMonth = getMonth(nextResetAtDate);

	const shouldCheck =
		nextResetAtDay === 30 || (nextResetAtDay === 28 && nextResetAtMonth === 2);

	if (!shouldCheck) {
		return nextResetAt;
	}

	// 1. Get the customer product
	const cusProduct = await CusProductService.getByIdForReset({
		db,
		id: cusEnt.customer_product_id,
	});

	// Get org and env
	const env = cusProduct.product.env as AppEnv;
	const org = cusProduct.product.org as Organization;

	const stripeCli = createStripeCli({ org, env });
	if (
		!cusProduct.subscription_ids ||
		cusProduct.subscription_ids.length === 0
	) {
		return nextResetAt;
	}

	const subId = cusProduct.subscription_ids[0];
	const sub = await stripeCli.subscriptions.retrieve(subId);

	const billingCycleAnchor = sub.billing_cycle_anchor * 1000;
	console.log("Checking billing cycle anchor");
	console.log(
		"Next reset at       ",
		format(new UTCDate(nextResetAt), "dd MMM yyyy HH:mm:ss"),
	);
	console.log(
		"Billing cycle anchor",
		format(new UTCDate(billingCycleAnchor), "dd MMM yyyy HH:mm:ss"),
	);

	const billingCycleDay = getDate(new UTCDate(billingCycleAnchor));
	const nextResetDay = getDate(nextResetAtDate);

	if (billingCycleDay > nextResetDay) {
		nextResetAtDate = setDate(nextResetAtDate, billingCycleDay);
		return nextResetAtDate.getTime();
	} else {
		return nextResetAt;
	}
};

const handleShortDurationCusEnt = async ({
	db,
	cusEnt,
	cacheEnabledOrgs,
}: {
	db: DrizzleCli;
	cusEnt: ResetCusEnt;
	cacheEnabledOrgs: any[];
}) => {
	const ent = cusEnt.entitlement as FullEntitlement;

	const resetCusEnt = {
		...cusEnt,
		next_reset_at: getNextResetAt({
			curReset: new UTCDate(cusEnt.next_reset_at!),
			interval: ent.interval as EntInterval,
			intervalCount: ent.interval_count,
		}),
		adjustment: 0,
		...getResetBalancesUpdate({
			cusEnt,
			allowance: new Decimal(ent.allowance || 0)
				.mul(cusEnt.customer_product.quantity)
				.toNumber(),
		}),
	};
	const newCusEnt = resetCusEnt;

	const rolloverUpdate = getRolloverUpdates({
		cusEnt,
		nextResetAt: cusEnt.next_reset_at! as number,
	});

	if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
		await RolloverService.insert({
			db,
			rows: rolloverUpdate.toInsert,
			fullCusEnt: cusEnt,
		});
	}

	console.log(
		`Reseting short cus ent (${cusEnt.feature_id}) [${ent.interval}], customer: ${cusEnt.customer_id}, org: ${cusEnt.customer.org_id}`,
	);

	const org = await OrgService.get({
		db,
		orgId: cusEnt.customer.org_id,
	});
	await deleteCusCache({
		db,
		customerId: cusEnt.customer.id!,
		org: org,
		env: cusEnt.customer.env,
	});

	return newCusEnt;
};

const shortDurations = [EntInterval.Minute, EntInterval.Hour, EntInterval.Day];

export const resetCustomerEntitlement = async ({
	db,
	cusEnt,
	cacheEnabledOrgs,
}: {
	db: DrizzleCli;
	cusEnt: ResetCusEnt;
	cacheEnabledOrgs: any[];
}) => {
	try {
		const ent = cusEnt.entitlement as FullEntitlement;

		if (
			ent.allowance_type === AllowanceType.Fixed &&
			shortDurations.includes(ent.interval as EntInterval)
		) {
			return await handleShortDurationCusEnt({
				db,
				cusEnt,
				cacheEnabledOrgs,
			});
		}

		// Fetch related price
		const cusPrices = await CusPriceService.getByCustomerProductId({
			db,
			customerProductId: cusEnt.customer_product_id,
		});

		// 2. Quantity is from prices...
		const relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);
		if (relatedCusPrice) {
			return;
		}

		const entOptions = getEntOptions(
			cusEnt.customer_product.options,
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
				`Reset ${cusEnt.id} | customer: ${chalk.yellow(
					cusEnt.customer_id,
				)} | feature: ${chalk.yellow(
					cusEnt.feature_id,
				)} | new balance: unlimited`,
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
				`Reset ${cusEnt.id} | customer: ${chalk.yellow(
					cusEnt.customer_id,
				)} | feature: ${chalk.yellow(
					cusEnt.feature_id,
				)} | reset to lifetime (next_reset_at: null)`,
			);
			return;
		}

		const resetBalance = getStartingBalance({
			entitlement: cusEnt.entitlement,
			options: entOptions || undefined,
			relatedPrice: undefined,
			productQuantity: cusEnt.customer_product.quantity,
		});

		// 1. Check if should reset

		let nextResetAt = getNextResetAt({
			curReset: new UTCDate(cusEnt.next_reset_at!),
			interval: cusEnt.entitlement.interval as EntInterval,
			intervalCount: cusEnt.entitlement.interval_count,
		});

		const rolloverUpdate = getRolloverUpdates({
			cusEnt,
			nextResetAt: cusEnt.next_reset_at! as number,
		});

		const resetBalanceUpdate = getResetBalancesUpdate({
			cusEnt,
			allowance: resetBalance || undefined,
		});

		try {
			nextResetAt = await checkSubAnchor({
				db,
				cusEnt,
				nextResetAt,
			});
		} catch (error) {
			console.log("WARNING: Failed to check sub anchor");
			console.log(error);
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

		console.log(
			`Reset ${cusEnt.id} | customer: ${chalk.yellow(
				cusEnt.customer_id,
			)} | feature: ${chalk.yellow(
				cusEnt.feature_id,
			)} | new balance: ${chalk.green(
				resetBalance,
			)} | new next_reset_at: ${chalk.green(
				format(new UTCDate(nextResetAt), "dd MMM yyyy HH:mm:ss"),
			)}`,
		);

		// let cacheOrg = cacheEnabledOrgs.find(
		//   (org) => org.id === cusEnt.customer.org_id
		// );

		const org = await OrgService.get({
			db,
			orgId: cusEnt.customer.org_id,
		});
		await deleteCusCache({
			db,
			customerId: cusEnt.customer.id!,
			org: org,
			env: cusEnt.customer.env,
		});
		// if (cacheOrg) {
		//   await deleteCusCache({
		//     db,
		//     customerId: cusEnt.customer.id!,
		//     org: cacheOrg,
		//     env: cusEnt.customer.env,
		//   });
		// }
	} catch (error: any) {
		console.log(
			`Failed to reset ${cusEnt.id} | ${cusEnt.customer_id} | ${cusEnt.feature_id}, error: ${error}`,
		);
	}
};
