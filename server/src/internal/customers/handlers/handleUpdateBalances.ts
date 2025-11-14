// import { ErrCode, getCusEntBalance } from "@autumn/shared";
// import { Decimal } from "decimal.js";
// import { StatusCodes } from "http-status-codes";
// import { CusService } from "@/internal/customers/CusService.js";
// import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
// import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
// import { FeatureService } from "@/internal/features/FeatureService.js";
// import { OrgService } from "@/internal/orgs/OrgService.js";
// import {
// 	deductAllowanceFromCusEnt,
// 	deductFromUsageBasedCusEnt,
// } from "@/trigger/updateBalanceTask.js";
// import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
// import { notNullish } from "@/utils/genUtils.js";
// import { getCusEntsInFeatures } from "../cusUtils/cusUtils.js";

// const getCusFeaturesAndOrg = async (req: any, customerId: string) => {
// 	// 1. Get customer
// 	const [customer, features, org] = await Promise.all([
// 		CusService.getFull({
// 			db: req.db,
// 			idOrInternalId: customerId,
// 			orgId: req.orgId,
// 			env: req.env,
// 			entityId: req.params.entity_id,
// 		}),
// 		FeatureService.getFromReq(req),
// 		OrgService.getFromReq(req),
// 	]);

// 	if (!customer) {
// 		throw new RecaseError({
// 			message: `Customer ${customerId} not found`,
// 			code: ErrCode.CustomerNotFound,
// 			statusCode: StatusCodes.NOT_FOUND,
// 		});
// 	}

// 	return { customer, features, org };
// };

// export const handleUpdateBalances = async (req: any, res: any) => {
// 	try {
// 		const logger = req.logger;
// 		const cusId = req.params.customer_id;
// 		const { env, db, features } = req;
// 		const { balances } = req.body;

// 		if (!Array.isArray(balances)) {
// 			throw new RecaseError({
// 				message: "Balances must be an array",
// 				code: ErrCode.InvalidRequest,
// 				statusCode: StatusCodes.BAD_REQUEST,
// 			});
// 		}

// 		const { customer, org } = await getCusFeaturesAndOrg(req, cusId);

// 		const featuresToUpdate = features.filter((f: any) =>
// 			balances.map((b: any) => b.feature_id).includes(f.id),
// 		);

// 		if (featuresToUpdate.length === 0) {
// 			throw new RecaseError({
// 				message: "No valid features found to update",
// 				code: ErrCode.InvalidRequest,
// 				statusCode: StatusCodes.BAD_REQUEST,
// 			});
// 		}

// 		const { cusEnts, cusPrices } = await getCusEntsInFeatures({
// 			customer,
// 			internalFeatureIds: featuresToUpdate.map((f: any) => f.internal_id!),
// 			logger: req.logger,
// 		});

// 		logger.info("--------------------------------");
// 		logger.info(
// 			`REQUEST: UPDATE BALANCES FOR CUSTOMER ${customer.id}, ORG: ${org.slug}`,
// 		);
// 		logger.info(
// 			`Features to update: ${balances.map(
// 				(b: any) =>
// 					`${b.feature_id} - ${b.unlimited ? "unlimited" : b.balance}`,
// 			)}`,
// 		);

// 		// Get deductions for each feature
// 		const featureDeductions = [];
// 		for (const balance of balances) {
// 			if (!balance.feature_id) {
// 				throw new RecaseError({
// 					message: "Feature ID is required",
// 					code: ErrCode.InvalidRequest,
// 					statusCode: StatusCodes.BAD_REQUEST,
// 				});
// 			}

// 			if (typeof balance.balance !== "number" && balance.unlimited !== true) {
// 				throw new RecaseError({
// 					message: "Balance must be a number",
// 					code: ErrCode.InvalidRequest,
// 					statusCode: StatusCodes.BAD_REQUEST,
// 				});
// 			}

// 			const feature = featuresToUpdate.find(
// 				(f: any) => f.id === balance.feature_id,
// 			);

// 			if (balance.unlimited === true) {
// 				featureDeductions.push({
// 					feature,
// 					unlimited: true,
// 					toDeduct: 0,
// 				});
// 				continue;
// 			}

// 			const { unlimited } = getUnlimitedAndUsageAllowed({
// 				cusEnts,
// 				internalFeatureId: feature!.internal_id!,
// 			});

// 			if (unlimited) {
// 				throw new RecaseError({
// 					message: `Can't set balance for unlimited feature: ${feature!.id}`,
// 					code: ErrCode.InvalidRequest,
// 					statusCode: StatusCodes.BAD_REQUEST,
// 				});
// 			}

// 			// Get deductions
// 			const newBalance = balance.balance;
// 			let curBalance = new Decimal(0);
// 			const properties = structuredClone(balance);
// 			delete properties.feature_id;
// 			delete properties.balance;

// 			for (const cusEnt of cusEnts) {
// 				const cusEntIntCount = cusEnt.entitlement.interval_count || 1;
// 				const deductionIntCount = balance.interval_count || 1;

// 				const intCountMatch = notNullish(balance.interval_count)
// 					? cusEntIntCount === deductionIntCount
// 					: true;

// 				const intMatch = notNullish(balance.interval)
// 					? balance.interval === cusEnt.entitlement.interval
// 					: true;

// 				if (
// 					cusEnt.internal_feature_id !== feature!.internal_id! ||
// 					!intMatch ||
// 					!intCountMatch
// 				) {
// 					continue;
// 				}

// 				const { balance: cusEntBalance } = getCusEntBalance({
// 					cusEnt,
// 					entityId: balance.entity_id,
// 				});

// 				curBalance = curBalance.add(new Decimal(cusEntBalance!));
// 			}

// 			const toDeduct = curBalance.sub(newBalance).toNumber();

// 			if (toDeduct === 0) {
// 				logger.info(`Skipping ${feature!.id} -- no change`);
// 			}

// 			featureDeductions.push({
// 				feature,
// 				toDeduct,
// 				properties,
// 				interval: balance.interval,
// 				intervalCount: balance.interval_count,
// 			});
// 		}

// 		const batchDeduct = [];

// 		for (const featureDeduction of featureDeductions) {
// 			// 1. Deduct from allowance
// 			const performDeduction = async () => {
// 				let { toDeduct, feature, properties, interval } = featureDeduction;

// 				// Handle unlimited
// 				if (featureDeduction.unlimited) {
// 					// Get one active cusEnt and set unlimited to true

// 					const cusEnt = notNullish(interval)
// 						? cusEnts.find((cusEnt) => {
// 								const cusEntIntCount = cusEnt.entitlement.interval_count || 1;
// 								const deductionIntCount = featureDeduction.intervalCount || 1;

// 								return (
// 									cusEnt.internal_feature_id === feature!.internal_id! &&
// 									cusEnt.entitlement.interval === interval &&
// 									cusEntIntCount === deductionIntCount
// 								);
// 							})
// 						: cusEnts.find(
// 								(cusEnt) =>
// 									cusEnt.internal_feature_id === feature!.internal_id!,
// 							);

// 					if (!cusEnt) {
// 						logger.warn(
// 							`No active cus ent to set unlimited balance for feature: ${
// 								feature!.id
// 							}`,
// 						);
// 						return;
// 					}

// 					await CusEntService.update({
// 						db,
// 						id: cusEnt.id,
// 						updates: {
// 							unlimited: true,
// 							next_reset_at: null,
// 						},
// 					});

// 					return;
// 				}

// 				for (const cusEnt of cusEnts) {
// 					const cusEntIntCount = cusEnt.entitlement.interval_count || 1;
// 					const deductionIntCount = featureDeduction.intervalCount || 1;

// 					const intCountMatch = notNullish(featureDeduction.intervalCount)
// 						? cusEntIntCount === deductionIntCount
// 						: true;

// 					const intMatch = notNullish(featureDeduction.interval)
// 						? featureDeduction.interval === cusEnt.entitlement.interval
// 						: true;

// 					if (
// 						cusEnt.internal_feature_id !==
// 							featureDeduction.feature!.internal_id! ||
// 						!intMatch ||
// 						!intCountMatch
// 					) {
// 						continue;
// 					}

// 					toDeduct = await deductAllowanceFromCusEnt({
// 						toDeduct,
// 						deductParams: {
// 							db,
// 							feature: featureDeduction.feature!,
// 							env: req.env,
// 							org,
// 							cusPrices: cusPrices as any[],
// 							customer,
// 						},
// 						cusEnt,
// 						featureDeductions: [], // not important because not deducting credits
// 						willDeductCredits: false,
// 					});
// 				}

// 				if (toDeduct === 0) {
// 					return;
// 				}

// 				await deductFromUsageBasedCusEnt({
// 					toDeduct,
// 					cusEnts,
// 					deductParams: {
// 						db,
// 						feature: featureDeduction.feature!,
// 						env,
// 						org,
// 						cusPrices: cusPrices as any[],
// 						customer,
// 					},
// 				});
// 			};
// 			batchDeduct.push(performDeduction());
// 		}
// 		await Promise.all(batchDeduct);

// 		logger.info("   ✅ Successfully updated balances");

// 		res.status(200).json({ success: true });
// 	} catch (error) {
// 		handleRequestError({ req, error, res, action: "update customer balances" });
// 	}
// };
