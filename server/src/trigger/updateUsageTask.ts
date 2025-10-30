import {
	AllowanceType,
	type AppEnv,
	CusProductStatus,
	type Customer,
	customerEntitlements,
	customers,
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCustomerEntitlement,
	type Organization,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { sql } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";
import { refreshCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import { getFeatureBalance } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { deductFromApiCusRollovers } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverDeductionUtils.js";
import { getCusEntsInFeatures } from "@/internal/customers/cusUtils/cusUtils.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { handleThresholdReached } from "./handleThresholdReached.js";
import {
	deductAllowanceFromCusEnt,
	deductFromUsageBasedCusEnt,
} from "./updateBalanceTask.js";

// 2. Get deductions for each feature
const getFeatureDeductions = ({
	cusEnts,
	value,
	features,
	shouldSet,
	entityId,
}: {
	cusEnts: FullCustomerEntitlement[];
	value: number;
	features: Feature[];
	shouldSet: boolean;
	entityId?: string;
}) => {
	const meteredFeature =
		features.find((f) => f.type === FeatureType.Metered) || features[0];

	const featureDeductions = [];
	for (const feature of features) {
		let newValue = value;
		const unlimitedExists = cusEnts.some(
			(cusEnt) =>
				cusEnt.entitlement.allowance_type === AllowanceType.Unlimited &&
				cusEnt.entitlement.internal_feature_id === feature.internal_id,
		);

		if (unlimitedExists) {
			continue;
		}

		if (feature.type === FeatureType.CreditSystem) {
			newValue = featureToCreditSystem({
				featureId: meteredFeature.id,
				creditSystem: feature,
				amount: value,
			});
		}

		// If it's set
		let deduction = newValue;

		if (shouldSet) {
			const totalAllowance = cusEnts.reduce((acc, curr) => {
				return acc + (curr.entitlement.allowance || 0);
			}, 0);

			const targetBalance = new Decimal(totalAllowance).sub(value).toNumber();

			const totalBalance = getFeatureBalance({
				cusEnts,
				internalFeatureId: feature.internal_id!,
				entityId,
			})!;

			deduction = new Decimal(totalBalance).sub(targetBalance).toNumber();
		}

		if (deduction === 0) {
			console.log(`   - Skipping feature ${feature.id} -- deduction is 0`);
			continue;
		}

		featureDeductions.push({
			feature,
			deduction,
		});
	}

	featureDeductions.sort((a, b) => {
		if (
			a.feature.type === FeatureType.CreditSystem &&
			b.feature.type !== FeatureType.CreditSystem
		) {
			return 1;
		}

		if (
			a.feature.type !== FeatureType.CreditSystem &&
			b.feature.type === FeatureType.CreditSystem
		) {
			return -1;
		}

		return a.feature.id.localeCompare(b.feature.id);
	});

	return featureDeductions;
};

/**
 * Calculate total available rollover balance for a feature
 */
const calculateAvailableRolloverBalance = ({
	cusEnts,
	feature,
	entityId,
}: {
	cusEnts: FullCustomerEntitlement[];
	feature: Feature;
	entityId?: string;
}) => {
	const featureCusEnts = cusEnts.filter(
		(cusEnt) => cusEnt.entitlement.internal_feature_id === feature.internal_id,
	);

	if (!entityId) {
		// Non-entity: sum rollover.balance
		return featureCusEnts.reduce((sum, cusEnt) => {
			const rolloverSum = cusEnt.rollovers.reduce(
				(rSum, rollover) =>
					new Decimal(rSum).add(rollover.balance || 0).toNumber(),
				0,
			);
			return new Decimal(sum).add(rolloverSum).toNumber();
		}, 0);
	} else {
		// Entity: sum rollover.entities[entityId].balance
		return featureCusEnts.reduce((sum, cusEnt) => {
			const rolloverSum = cusEnt.rollovers.reduce((rSum, rollover) => {
				const entityRollover = rollover.entities?.[entityId];
				if (entityRollover) {
					return new Decimal(rSum).add(entityRollover.balance || 0).toNumber();
				}
				return rSum;
			}, 0);
			return new Decimal(sum).add(rolloverSum).toNumber();
		}, 0);
	}
};

/**
 * Validate that the deduction is possible given the current balance and usage allowed.
 * Constraint 1: Insufficient balance without usage_allowed.
 * Constraint 2: Usage limit exceeded for customer entitlements with usage_allowed.
 */
const validateDeductionPossible = ({
	cusEnts,
	featureDeductions,
	entityId,
}: {
	cusEnts: FullCustomerEntitlement[];
	featureDeductions: { feature: Feature; deduction: number }[];
	entityId?: string;
}) => {
	for (const { feature, deduction } of featureDeductions) {
		const featureCusEnts = cusEnts.filter(
			(customerEntitlement) =>
				customerEntitlement.entitlement.internal_feature_id ===
				feature.internal_id,
		);

		// CONSTRAINT 1: Insufficient balance without usage_allowed
		const cusEntBalance = getFeatureBalance({
			cusEnts: featureCusEnts,
			internalFeatureId: feature.internal_id!,
			entityId,
		});

		// If unlimited, skip validation
		if (cusEntBalance === null) {
			continue;
		}
		const rolloverBalance = calculateAvailableRolloverBalance({
			cusEnts,
			feature,
			entityId,
		});
		const totalBalance = new Decimal(cusEntBalance)
			.add(rolloverBalance)
			.toNumber();

		const hasUsageAllowed = featureCusEnts.some(
			(customerEntitlement) => customerEntitlement.usage_allowed,
		);

		// Check if this is a "free" feature (single-use with included_usage but no pricing)
		// Only apply to SingleUse features; ContinuousUse (allocated) features should reject
		const isFreeFeature =
			feature.type === FeatureType.Metered &&
			feature.config?.usage_type === FeatureUsageType.Single &&
			featureCusEnts.some(
				(cusEnt) =>
					cusEnt.entitlement.allowance && cusEnt.entitlement.allowance > 0,
			) &&
			!hasUsageAllowed;

		// For free SingleUse features, allow tracking beyond balance (will cap at 0 in performDeduction)
		// For prepaid/allocated/other features without usage_allowed, reject insufficient balance
		if (totalBalance < deduction && !hasUsageAllowed && !isFreeFeature) {
			throw new RecaseError({
				message: `Insufficient balance for feature ${feature.id}. Available: ${totalBalance} (${cusEntBalance} + ${rolloverBalance} rollover), Required: ${deduction}`,
				code: ErrCode.InsufficientBalance,
				statusCode: StatusCodes.BAD_REQUEST,
				data: {
					feature_id: feature.id,
					available: totalBalance,
					cus_ent_balance: cusEntBalance,
					rollover_balance: rolloverBalance,
					required: deduction,
				},
			});
		}

		// CONSTRAINT 2: Usage limit exceeded for customer entitlements with usage_allowed
		const entitlementDeduction =
			new Decimal(deduction).sub(rolloverBalance).toNumber() > 0
				? new Decimal(deduction).sub(rolloverBalance).toNumber()
				: 0;

		if (entitlementDeduction > 0) {
			const featureCusEntsWithUsageAllowed = featureCusEnts.filter(
				(customerEntitlement) => customerEntitlement.usage_allowed,
			);

			const totalRemainingLimit = featureCusEntsWithUsageAllowed.reduce(
				(sum, cusEnt) => {
					const usageLimit = cusEnt.entitlement.usage_limit;
					if (!usageLimit) {
						return sum;
					}

					const featureBalance = getFeatureBalance({
						cusEnts: [cusEnt],
						internalFeatureId: feature.internal_id!,
						entityId,
					});

					// Skip if unlimited
					if (featureBalance === null) {
						return sum;
					}

					const allowance = new Decimal(cusEnt.entitlement.allowance || 0);
					const currentBalance = new Decimal(featureBalance);
					const currentUsed = allowance.sub(currentBalance);
					const remainingLimit = new Decimal(usageLimit).sub(currentUsed);

					return new Decimal(sum)
						.add(Decimal.max(0, remainingLimit))
						.toNumber();
				},
				0,
			);

			if (
				featureCusEntsWithUsageAllowed.length > 0 &&
				entitlementDeduction > totalRemainingLimit
			) {
				throw new RecaseError({
					message: `Usage limit exceeded for feature ${feature.id}. Total remaining capacity: ${totalRemainingLimit}, Requested from entitlement: ${entitlementDeduction} (${rolloverBalance} covered by rollovers)`,
					code: ErrCode.InsufficientBalance,
					statusCode: StatusCodes.BAD_REQUEST,
					data: {
						feature_id: feature.id,
						total_remaining_capacity: totalRemainingLimit,
						requested_from_entitlement: entitlementDeduction,
						covered_by_rollovers: rolloverBalance,
						total_requested: deduction,
					},
				});
			}
		}
	}
};

const logUsageUpdate = ({
	customer,
	features,
	cusEnts,
	featureDeductions,
	org,
	setUsage,
	entityId,
}: {
	customer: Customer;
	features: Feature[];
	cusEnts: FullCustomerEntitlement[];
	featureDeductions: any;
	org: Organization;
	setUsage: boolean;
	entityId?: string;
}) => {
	console.log(
		`   - Customer: ${customer.id} (${customer.env}) | Org: ${
			org.slug
		} | Features: ${features.map((f) => f.id).join(", ")} | Set Usage: ${
			setUsage ? "true" : "false"
		}`,
	);

	console.log(
		"   - CusEnts:",
		cusEnts.map((cusEnt: any) => {
			let balanceStr = cusEnt.balance;
			try {
				if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
					balanceStr = "Unlimited";
				}
			} catch (_error) {
				balanceStr = "failed_to_get_balance";
			}

			if (entityId && cusEnt.entities) {
				balanceStr = `${cusEnt.entities?.[entityId!]?.balance} [${entityId}]`;
			}

			return `${cusEnt.feature_id} - ${balanceStr} (${
				cusEnt.customer_product ? cusEnt.customer_product.product_id : ""
			})`;
		}),
		"| Deductions:",
		featureDeductions.map((f: any) => `${f.feature.id}: ${f.deduction}`),
	);
};

// Main function to update customer balance
export const updateUsage = async ({
	db,
	customerId,
	features,
	org,
	env,
	value,
	properties,
	setUsage,
	logger,
	entityId,
	allFeatures,
}: {
	db: DrizzleCli;
	customerId: string;
	features: Feature[];
	org: Organization;
	env: AppEnv;
	value: number;
	properties: any;
	setUsage: boolean;
	logger: any;
	entityId?: string;
	allFeatures: Feature[];
}) => {
	const customer = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		entityId,
		withSubs: true,
	});

	const { cusEnts, cusPrices } = await getCusEntsInFeatures({
		customer,
		internalFeatureIds: features.map((f) => f.internal_id!),
		logger,
		reverseOrder: org.config?.reverse_deduction_order,
	});

	// 1. Get deductions for each feature
	const featureDeductions = getFeatureDeductions({
		cusEnts,
		value,
		shouldSet: setUsage,
		features,
		entityId,
	});

	logUsageUpdate({
		customer,
		features,
		cusEnts,
		featureDeductions,
		org,
		setUsage,
		entityId,
	});

	// 3. Return if no customer entitlements or features found
	if (cusEnts.length === 0 || features.length === 0) {
		console.log("   - No customer entitlements or features found");
		return;
	}

	validateDeductionPossible({ cusEnts, featureDeductions, entityId });

	const originalCusEnts = structuredClone(cusEnts);
	for (const obj of featureDeductions) {
		let { feature, deduction: toDeduct } = obj;

		for (const cusEnt of cusEnts) {
			if (cusEnt.entitlement.internal_feature_id !== feature.internal_id) {
				continue;
			}

			toDeduct = await deductFromApiCusRollovers({
				toDeduct,
				cusEnt,
				deductParams: {
					db,
					feature,
					env,
					entity: customer.entity ? customer.entity : undefined,
				},
			});

			if (toDeduct === 0) continue;

			toDeduct = await deductAllowanceFromCusEnt({
				toDeduct,
				cusEnt,
				deductParams: {
					db,
					feature,
					env,
					org,
					cusPrices: cusPrices as any[],
					customer,
					entity: customer.entity,
				},
				featureDeductions,
				willDeductCredits: true,
				setZeroAdjustment: true,
			});
		}

		if (toDeduct !== 0) {
			await deductFromUsageBasedCusEnt({
				toDeduct,
				cusEnts,
				deductParams: {
					db,
					feature,
					env,
					org,
					cusPrices: cusPrices as any[],
					customer,
					entity: customer.entity,
				},
				setZeroAdjustment: true,
			});
		}

		handleThresholdReached({
			org,
			env,
			features: allFeatures,
			db,

			feature,
			cusEnts: originalCusEnts,
			newCusEnts: cusEnts,
			fullCus: customer,
			logger,
		});
	}

	return cusEnts;
};

// MAIN FUNCTION
export const runUpdateUsageTask = async ({
	payload,
	logger,
	db,
	throwError = false,
}: {
	payload: any;
	logger: any;
	db: DrizzleCli;
	throwError?: boolean;
}) => {
	try {
		// 1. Update customer balance
		const {
			internalCustomerId,
			customerId,
			eventId,
			features,
			value,
			set_usage,
			properties,
			org,
			env,
			entityId,
			allFeatures,
		} = payload;

		console.log("--------------------------------");
		console.log(
			`HANDLING USAGE TASK FOR CUSTOMER (${customerId}), ORG: ${org.slug}, EVENT ID: ${eventId}`,
		);

		const cusEnts = await db.transaction(
			async (tx) => {
				// Lock ALL customer entitlements for this customer using JOIN
				await tx.execute(sql`
					SELECT ce.* 
					FROM ${customerEntitlements} ce
					INNER JOIN ${customers} c ON ce.internal_customer_id = c.internal_id
					WHERE c.id = ${customerId} 
						AND c.org_id = ${org.id}
						AND c.env = ${env}
					FOR UPDATE OF ce
				`);
				// Acquire advisory lock for this customer (and entity if provided) to serialize concurrent requests
				// Include entity_id in lock key so different entities can update concurrently
				// const lockKeyStr = `${internalCustomerId}_${org.id}_${env}${entityId ? `_${entityId}` : ""}`;
				// const hash =
				// 	lockKeyStr.split("").reduce((acc, char) => {
				// 		return (acc << 5) - acc + char.charCodeAt(0);
				// 	}, 0) | 0; // Convert to 32-bit integer

				// console.log(
				// 	`   🔒 [${eventId}] Acquiring advisory lock (hash=${hash}) for: ${lockKeyStr}`,
				// );
				// await tx.execute(sql`SELECT pg_advisory_xact_lock(${hash})`);
				// console.log(
				// 	`   🔓 [${eventId}] Advisory lock acquired, proceeding with update`,
				// );

				return await updateUsage({
					db: tx as unknown as DrizzleCli,
					customerId,
					features,
					value,
					properties,
					org,
					env,
					setUsage: set_usage,
					logger,
					entityId,
					allFeatures,
				});
			},
			{
				isolationLevel: "read committed",
			},
		);

		await refreshCusCache({
			db,
			customerId,
			entityId,
			org,
			env,
		});
	} catch (error) {
		logger.error(`ERROR UPDATING USAGE`);
		logger.error(error);

		if (throwError) {
			throw error;
		}
	}
};
