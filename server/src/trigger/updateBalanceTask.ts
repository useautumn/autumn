import {
	AllowanceType,
	type AppEnv,
	BillingType,
	CusProductStatus,
	type Customer,
	type Entity,
	type EntityBalance,
	type Event,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	getStartingBalance,
	type Organization,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { entityFeatureIdExists } from "@/internal/api/entities/entityUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { findCusEnt } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import {
	getCusEntMasterBalance,
	getRelatedCusPrice,
	getTotalNegativeBalance,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { deductFromApiCusRollovers } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverDeductionUtils.js";
import { getCusEntsInFeatures } from "@/internal/customers/cusUtils/cusUtils.js";
import {
	creditSystemContainsFeature,
	featureToCreditSystem,
} from "@/internal/features/creditSystemUtils.js";
import {
	getBillingType,
	getEntOptions,
} from "@/internal/products/prices/priceUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { adjustAllowance } from "./adjustAllowance.js";
import {
	getCreditSystemDeduction,
	getMeteredDeduction,
	performDeduction,
} from "./deductUtils.js";

export type DeductParams = {
	db: DrizzleCli;
	env: AppEnv;
	org: Organization;
	cusPrices: FullCustomerPrice[];
	customer: Customer;
	// properties: any;
	feature: Feature;
	entity?: Entity;
};

export type RolloverDeductParams = {
	db: DrizzleCli;
	env: AppEnv;
	feature: Feature;
	entity?: Entity;
};

// 2. Get deductions for each feature
const getFeatureDeductions = ({
	cusEnts,
	event,
	features,
}: {
	cusEnts: FullCustomerEntitlement[];
	event: Event;
	features: Feature[];
}) => {
	const meteredFeatures = features.filter(
		(feature) => feature.type === FeatureType.Metered,
	);
	const featureDeductions = [];
	for (const feature of features) {
		let deduction: number | undefined;
		if (feature.type === FeatureType.Metered) {
			deduction = getMeteredDeduction(feature, event);
		} else if (feature.type === FeatureType.CreditSystem) {
			deduction = getCreditSystemDeduction({
				meteredFeatures: meteredFeatures,
				creditSystem: feature,
				event,
			});
		}

		// Check if unlimited exists
		const unlimitedExists = cusEnts.some(
			(cusEnt) =>
				cusEnt.entitlement.allowance_type === AllowanceType.Unlimited &&
				cusEnt.entitlement.internal_feature_id === feature.internal_id,
		);

		if (unlimitedExists || !deduction) {
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

export const logBalanceUpdate = ({
	timeTaken,
	customer,
	features,
	cusEnts,
	featureDeductions,
	properties,
	entityId,
	org,
}: {
	timeTaken: string;
	customer: Customer;
	features: Feature[];
	cusEnts: FullCustomerEntitlement[];
	featureDeductions: any;
	properties: any;
	entityId?: string | null;
	org: Organization;
}) => {
	console.log(
		`   - Customer: ${customer.id} (${customer.env}) | Org: ${
			org.slug
		} | Features: ${features.map((f) => f.id).join(", ")}`,
	);
	console.log("   - Properties:", properties);
	console.log(
		"   - CusEnts:",
		cusEnts.map((cusEnt: any) => {
			let balanceStr = cusEnt.balance;

			if (notNullish(cusEnt.entitlement?.entity_feature_id)) {
				console.log(
					`   - Entity feature ID found for feature: ${cusEnt.feature_id}`,
				);

				if (notNullish(entityId)) {
					balanceStr = `${cusEnt.entities?.[entityId!]?.balance} [${entityId}]`;
				} else {
					balanceStr = `${
						getCusEntMasterBalance({
							cusEnt,
							entities: cusEnt.customer_product?.entities,
						}).balance
					} [Master]`;
				}
			}
			try {
				if (cusEnt.entitlement?.allowance_type === AllowanceType.Unlimited) {
					balanceStr = "Unlimited";
				}
			} catch (error) {
				balanceStr = "failed_to_get_balance";
			}

			return `${cusEnt.feature_id} - ${balanceStr} (${
				cusEnt.customer_product ? cusEnt.customer_product.product_id : ""
			})`;
		}),
		"| Deductions:",
		featureDeductions.map((f: any) => `${f.feature.id}: ${f.deduction}`),
	);
};

export const performDeductionOnCusEnt = ({
	cusEnt,
	toDeduct,
	entityId,
	allowNegativeBalance = false,
	addAdjustment = false,
	setZeroAdjustment = false,
	blockUsageLimit = true,
	field = "balance",
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	toDeduct: number;
	entityId?: string | null;
	allowNegativeBalance?: boolean;
	addAdjustment?: boolean;
	setZeroAdjustment?: boolean;
	blockUsageLimit?: boolean;
	field?: "balance" | "additional_balance";
}): {
	newBalance: number;
	newEntities: Record<string, EntityBalance> | undefined;
	deducted: number;
	toDeduct: number;
	newAdjustment?: number;
} => {
	let newEntities: Record<string, EntityBalance> | undefined =
		structuredClone(cusEnt.entities) ?? undefined;

	let newBalance: number = structuredClone(cusEnt[field]) ?? 0;
	let deducted = 0;

	// To deprecate: adjustment.
	let newAdjustment = structuredClone(cusEnt.adjustment);

	const cusProduct = cusEnt.customer_product;

	// 2. Get options, related price and starting balance!
	const options = notNullish(cusProduct)
		? getEntOptions(cusProduct.options, cusEnt.entitlement)
		: undefined;

	const cusPrice = notNullish(cusProduct)
		? getRelatedCusPrice(cusEnt, cusProduct.customer_prices)
		: undefined;

	const resetBalance = notNullish(cusProduct)
		? getStartingBalance({
				options: options || undefined,
				relatedPrice: cusPrice?.price,
				entitlement: cusEnt.entitlement,
			})
		: cusEnt.entitlement.allowance || 0;

	if (entityFeatureIdExists({ cusEnt })) {
		// CASE 1: Deduct from entity balances

		if (nullish(entityId)) {
			newEntities = structuredClone(cusEnt.entities) as Record<
				string,
				EntityBalance
			>;
			if (!newEntities) newEntities = {};

			let toDeductCursor = toDeduct;
			for (const entityId in cusEnt.entities) {
				if (toDeductCursor === 0) break;

				const entityBalance = cusEnt.entities[entityId][field];

				const {
					newBalance: newEntityBalance,
					deducted: newDeducted,
					toDeduct: newToDeduct,
				} = performDeduction({
					cusEntBalance: new Decimal(entityBalance ?? 0),
					toDeduct: toDeductCursor,
					allowNegativeBalance,
					ent: cusEnt.entitlement,
					resetBalance,
					blockUsageLimit,
				});

				newEntities[entityId][field] = newEntityBalance!;

				if (addAdjustment) {
					const adjustment = newEntities[entityId].adjustment || 0;
					newEntities[entityId].adjustment = adjustment - newDeducted!;
				}

				if (setZeroAdjustment) {
					newEntities[entityId].adjustment = 0;
				}

				toDeductCursor = newToDeduct;
				deducted += newDeducted;
			}

			toDeduct = toDeductCursor;
		}

		// CASE 2: Deduct from entity balance
		else {
			if (!newEntities) newEntities = {};

			const currentEntityBalance = cusEnt.entities?.[entityId]?.[field];

			const {
				newBalance: newEntityBalance,
				deducted: newDeducted,
				toDeduct: newToDeduct,
			} = performDeduction({
				cusEntBalance: new Decimal(currentEntityBalance!),
				toDeduct,
				allowNegativeBalance,
				ent: cusEnt.entitlement,
				resetBalance,
				blockUsageLimit,
			});

			newEntities[entityId][field] = newEntityBalance!;

			if (addAdjustment) {
				const adjustment = newEntities[entityId].adjustment || 0;
				newEntities[entityId].adjustment = adjustment - newDeducted!;
			}

			if (setZeroAdjustment) {
				newEntities[entityId].adjustment = 0;
			}

			toDeduct = newToDeduct;
			deducted += newDeducted;
		}
	}

	// CASE 3: Deduct from balance
	else {
		const currentBalance = cusEnt[field] || 0;

		const {
			newBalance: newBalance_,
			deducted: deducted_,
			toDeduct: newToDeduct_,
		} = performDeduction({
			cusEntBalance: new Decimal(currentBalance),
			toDeduct,
			allowNegativeBalance,
			ent: cusEnt.entitlement,
			resetBalance,
			blockUsageLimit,
		});

		newBalance = newBalance_;
		deducted = deducted_;
		toDeduct = newToDeduct_;

		if (addAdjustment) {
			const adjustment = cusEnt.adjustment || 0;
			newAdjustment = adjustment - deducted!;
		}
	}

	return {
		newBalance,
		newEntities,
		deducted,
		toDeduct,
		newAdjustment: newAdjustment ?? undefined,
	};
};

export const deductAllowanceFromCusEnt = async ({
	toDeduct,
	deductParams,
	cusEnt,
	featureDeductions,
	willDeductCredits = false,
	setZeroAdjustment = false,
}: {
	toDeduct: number;
	deductParams: DeductParams;
	cusEnt: FullCusEntWithFullCusProduct;
	featureDeductions: any;
	willDeductCredits?: boolean;
	setZeroAdjustment?: boolean;
}) => {
	const { db, feature, env, org, cusPrices, customer, entity } = deductParams;

	if (
		entity &&
		entityFeatureIdExists({ cusEnt }) &&
		cusEnt.entitlement.entity_feature_id !== entity.feature_id
	)
		return toDeduct;

	const {
		newBalance,
		newEntities,
		deducted,
		toDeduct: newToDeduct,
	} = performDeductionOnCusEnt({
		cusEnt,
		toDeduct,
		entityId: entity?.id,
		allowNegativeBalance: false,
		setZeroAdjustment,
	});

	const originalGrpBalance = getTotalNegativeBalance({
		cusEnt,
		balance: cusEnt.balance!,
		entities: cusEnt.entities!,
	});

	const newGrpBalance = getTotalNegativeBalance({
		cusEnt,
		balance: newBalance!,
		entities: newEntities!,
	});

	const updates: any = {
		balance: newBalance,
		entities: newEntities,
	};
	if (setZeroAdjustment) {
		updates.adjustment = 0;
	}

	const { newReplaceables, deletedReplaceables } = await adjustAllowance({
		db,
		env,
		org,
		cusPrices: cusPrices as any,
		customer,
		affectedFeature: feature,
		cusEnt: cusEnt as any,
		originalBalance: originalGrpBalance,
		newBalance: newGrpBalance,
		logger: console,
	});

	if (newReplaceables && newReplaceables.length > 0) {
		updates.balance = newBalance! - newReplaceables.length;
	} else if (deletedReplaceables && deletedReplaceables.length > 0) {
		updates.balance = newBalance! + deletedReplaceables.length;
	}

	await CusEntService.update({
		db,
		id: cusEnt.id,
		updates,
	});

	// Deduct credit amounts too
	if (feature.type === FeatureType.Metered && willDeductCredits) {
		for (let i = 0; i < featureDeductions.length; i++) {
			const { feature: creditSystem, deduction } = featureDeductions[i];

			if (
				creditSystem.type === FeatureType.CreditSystem &&
				creditSystemContainsFeature({
					creditSystem: creditSystem,
					meteredFeatureId: feature.id!,
				})
			) {
				// toDeduct -= deduction;
				const creditAmount = featureToCreditSystem({
					featureId: feature.id!,
					creditSystem: creditSystem,
					amount: deducted,
				});
				const newDeduction = new Decimal(deduction)
					.minus(creditAmount)
					.toNumber();

				featureDeductions[i].deduction = newDeduction;
			}
		}
	}

	cusEnt.balance = newBalance;
	cusEnt.entities = newEntities;

	return newToDeduct;
};

export const deductFromUsageBasedCusEnt = async ({
	toDeduct,
	deductParams,
	cusEnts,
	setZeroAdjustment = false,
}: {
	toDeduct: number;
	deductParams: DeductParams;
	cusEnts: FullCusEntWithFullCusProduct[];
	setZeroAdjustment?: boolean;
}) => {
	const { db, feature, env, org, cusPrices, customer, entity } = deductParams;

	// Deduct from usage-based price
	let usageBasedEnt = findCusEnt({
		cusEnts,
		feature,
		entity,
		onlyUsageAllowed: true,
	}) as FullCusEntWithFullCusProduct;

	console.log(
		"Cus ents:",
		cusEnts.map(
			(ce) =>
				`Feature: ${ce.entitlement.feature_id}, Balance: ${ce.balance}, Usage Allowed: ${ce.usage_allowed}`,
		),
	);

	if (
		!usageBasedEnt &&
		feature.config?.usage_type === FeatureUsageType.Continuous
	) {
		console.log(`FALLING BACK TO REGULAR CUS ENT, FEATURE: ${feature.id}`);
		usageBasedEnt = findCusEnt({
			cusEnts,
			feature,
			entity,
		}) as FullCusEntWithFullCusProduct; // fallback to regular cus ent if allowed...
	}

	if (!usageBasedEnt) {
		console.log(
			`   - Feature ${feature.id}, To deduct: ${toDeduct} -> no usage-based entitlement found`,
		);
		return;
	}

	const cusPrice = getRelatedCusPrice(usageBasedEnt, cusPrices);
	const billingType = cusPrice?.price
		? getBillingType(cusPrice?.price.config ?? undefined)
		: undefined;
	const blockUsageLimit =
		billingType === BillingType.InArrearProrated ? false : true;

	const { newBalance, newEntities, deducted } = performDeductionOnCusEnt({
		cusEnt: usageBasedEnt,
		toDeduct,
		allowNegativeBalance: true,
		setZeroAdjustment,
		entityId: entity?.id,
		blockUsageLimit,
	});

	const oldGrpBalance = getTotalNegativeBalance({
		cusEnt: usageBasedEnt,
		balance: usageBasedEnt.balance!,
		entities: usageBasedEnt.entities!,
	});

	const newGrpBalance = getTotalNegativeBalance({
		cusEnt: usageBasedEnt,
		balance: newBalance!,
		entities: newEntities!,
	});

	// Update usageBasedEnt in place with the deduction results
	usageBasedEnt.balance = newBalance;
	usageBasedEnt.entities = newEntities;
	if (setZeroAdjustment) {
		usageBasedEnt.adjustment = 0;
	}

	const updates: any = {
		balance: newBalance,
		entities: newEntities,
	};
	if (setZeroAdjustment) {
		updates.adjustment = 0;
	}

	const { newReplaceables, deletedReplaceables } = await adjustAllowance({
		db,
		env,
		affectedFeature: feature,
		org,
		cusEnt: usageBasedEnt as any,
		cusPrices: cusPrices as any,
		customer,
		originalBalance: oldGrpBalance,
		newBalance: newGrpBalance,
		logger: console,
	});

	if (newReplaceables && newReplaceables.length > 0) {
		const finalBalance = newBalance! - newReplaceables.length;
		updates.balance = finalBalance;
		usageBasedEnt.balance = finalBalance;
	} else if (deletedReplaceables && deletedReplaceables.length > 0) {
		const finalBalance = newBalance! + deletedReplaceables.length;
		updates.balance = finalBalance;
		usageBasedEnt.balance = finalBalance;
	}

	await CusEntService.update({
		db,
		id: usageBasedEnt!.id,
		updates,
	});

	console.log("Usage based cus ent balance", usageBasedEnt.balance);
};

// Main function to update customer balance
export const updateCustomerBalance = async ({
	db,
	customerId,
	entityId,
	event,
	features,
	org,
	env,
	logger,
	allFeatures,
}: {
	db: DrizzleCli;
	customerId: string;
	entityId: string;
	event: Event;
	features: Feature[];
	org: Organization;
	env: AppEnv;
	logger: any;
	allFeatures: Feature[];
}) => {
	const startTime = performance.now();
	console.log("REVERSE DEDUCTION ORDER", org.config.reverse_deduction_order);
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
		reverseOrder: org.config.reverse_deduction_order,
	});

	const endTime = performance.now();

	// 1. Get deductions for each feature
	const featureDeductions = getFeatureDeductions({
		cusEnts,
		event,
		features,
	});

	logBalanceUpdate({
		timeTaken: (endTime - startTime).toFixed(2),
		customer,
		features,
		cusEnts,
		featureDeductions,
		properties: event.properties,
		org,
		entityId: event.entity_id,
	});

	// 3. Return if no customer entitlements or features found
	if (cusEnts.length === 0 || features.length === 0) {
		console.log("   - No customer entitlements or features found");
		return;
	}

	// 4. Perform deductions and update customer balance
	for (const obj of featureDeductions) {
		let { feature, deduction: toDeduct } = obj;

		const originalCusEnts = structuredClone(cusEnts);

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
			});
		}
	}

	return cusEnts;
};

// MAIN FUNCTION
export const runUpdateBalanceTask = async ({
	payload,
	logger,
	db,
}: {
	payload: any;
	logger: any;
	db: DrizzleCli;
}) => {
	try {
		// 1. Update customer balance
		const { customerId, features, event, org, env, entityId, allFeatures } =
			payload;

		console.log("--------------------------------");
		console.log(
			`UPDATING BALANCE FOR CUSTOMER (${customerId}), ORG: ${org.slug}`,
		);

		const cusEnts: any = await updateCustomerBalance({
			db,
			customerId,
			features,
			event,
			org,
			env,
			logger,
			entityId,
			allFeatures,
		});

		if (!cusEnts || cusEnts.length === 0) {
			return;
		}
		console.log("   ✅ Customer balance updated");
	} catch (error) {
		if (logger) {
			logger.use((log: any) => {
				return {
					...log,
					data: payload,
				};
			});

			logger.error(`ERROR UPDATING BALANCE`);
			logger.error(error);
		} else {
			console.log(error);
		}
	}
};
