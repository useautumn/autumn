import {
	type AppEnv,
	EntInterval,
	type Entitlement,
	type EntitlementWithFeature,
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
	notNullish,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import {
	validateCreditSystem,
	validateMeteredConfig,
} from "@/internal/features/featureUtils.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { keyToTitle } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { toApiFeature } from "../utils/mapFeatureUtils.js";
import { getObjectsUsingFeature } from "./handleUpdateFeature/getObjectsUsingFeature.js";
import { handleFeatureTypeChanged } from "./handleUpdateFeature/handleFeatureTypeChanged.js";

const handleFeatureIdChanged = async ({
	db,
	orgId,
	env,
	feature,
	linkedEntitlements,
	entitlements,
	prices,
	creditSystems,
	newId,
	logger,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	feature: Feature;
	linkedEntitlements: Entitlement[];
	entitlements: Entitlement[];
	prices: Price[];
	creditSystems: Feature[];
	newId: string;
	logger: any;
}) => {
	// 1. Check if any customer entitlement linked to this feature
	const cusEnts = await CusEntService.getByFeature({
		db,
		internalFeatureId: feature.internal_id!,
	});

	if (cusEnts.length > 0) {
		throw new RecaseError({
			message: `Cannot change id of feature ${feature.id} because a customer is using it`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	// 2. Update all linked objects
	const batchUpdate = [];

	for (const entitlement of linkedEntitlements) {
		batchUpdate.push(
			EntitlementService.update({
				db,
				id: entitlement.id!,
				updates: {
					entity_feature_id: newId,
				},
			}),
		);
	}

	await Promise.all(batchUpdate);

	// 3. Update all linked prices
	const priceUpdate = [];
	for (const price of prices) {
		priceUpdate.push(
			PriceService.update({
				db,
				id: price.id!,
				update: {
					config: {
						...price.config,
						feature_id: newId,
					} as UsagePriceConfig,
				},
			}),
		);
	}

	await Promise.all(priceUpdate);

	// 4. Update all linked credit systems
	const creditSystemUpdate = [];
	for (const creditSystem of creditSystems) {
		const newSchema = structuredClone(creditSystem.config.schema);
		for (let i = 0; i < newSchema.length; i++) {
			if (newSchema[i].metered_feature_id === feature.id) {
				newSchema[i].metered_feature_id = newId;
			}
		}
		creditSystemUpdate.push(
			FeatureService.update({
				db,
				id: creditSystem.id!,
				orgId,
				env,
				updates: {
					config: {
						...creditSystem.config,
						schema: newSchema,
					},
				},
			}),
		);
	}

	await Promise.all(creditSystemUpdate);

	// 5. Update all linked entitlements
	const entitlementUpdate = [];

	for (const entitlement of entitlements) {
		entitlementUpdate.push(
			EntitlementService.update({
				db,
				id: entitlement.id!,
				updates: {
					feature_id: newId,
				},
			}),
		);
	}

	await Promise.all(entitlementUpdate);
};

const handleFeatureUsageTypeChanged = async ({
	db,
	feature,
	newUsageType,
	linkedEntitlements,
	entitlements,
	prices,
	creditSystems,
}: {
	db: DrizzleCli;
	feature: Feature;
	newUsageType: FeatureUsageType;
	linkedEntitlements: EntitlementWithFeature[];
	entitlements: EntitlementWithFeature[];
	prices: Price[];
	creditSystems: Feature[];
}) => {
	const usageTypeTitle = keyToTitle(newUsageType).toLowerCase();
	if (creditSystems.length > 0) {
		throw new RecaseError({
			message: `Cannot set to ${usageTypeTitle} because it is used in credit system ${creditSystems[0].id}`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	if (linkedEntitlements.length > 0) {
		throw new RecaseError({
			message: `Cannot set to ${usageTypeTitle} because it is used as an entity by ${linkedEntitlements[0].feature.name}`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	// Get cus product using feature...
	const cusEnts = await CusEntService.getByFeature({
		db,
		internalFeatureId: feature.internal_id!,
	});

	if (cusEnts && cusEnts.length > 0) {
		throw new RecaseError({
			message: `Cannot set to ${usageTypeTitle} because it is / was used by customers`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	if (entitlements.length > 0) {
		console.log(
			`Feature usage type changed to ${newUsageType}, updating entitlements and prices`,
		);
		if (newUsageType === FeatureUsageType.Continuous) {
			const batchEntUpdate = [];
			for (const entitlement of entitlements) {
				batchEntUpdate.push(
					EntitlementService.update({
						db,
						id: entitlement.id!,
						updates: {
							interval: EntInterval.Lifetime,
						},
					}),
				);
			}

			await Promise.all(batchEntUpdate);
			console.log(`Updated ${entitlements.length} entitlements`);
		}
	}

	if (prices.length > 0) {
		const batchPriceUpdate = [];
		for (const price of prices) {
			const priceConfig = price.config as UsagePriceConfig;

			batchPriceUpdate.push(
				PriceService.update({
					db,
					id: price.id!,
					update: {
						config: {
							...priceConfig,
							should_prorate:
								newUsageType === FeatureUsageType.Continuous ? false : true, // if continuous, don't prorate -> get usage_in_arrear type...
							stripe_price_id: null,
						},
					},
				}),
			);
		}

		await Promise.all(batchPriceUpdate);
		console.log(`Updated ${prices.length} prices`);
	}

	// // Allow update for entitlement / price?
	// if (entitlements.length > 0) {
	// }
};

export const handleUpdateFeature = async (
	req: any,
	res: any,
	fromApi: boolean = false,
) =>
	routeHandler({
		req,
		res,
		action: "Update feature",
		handler: async (req: any, res: any) => {
			const featureId = req.params.feature_id;
			const data = req.body;
			const { db, orgId, env, logtail: logger } = req;

			// 1. Get feature by ID
			const features = await FeatureService.getFromReq(req);
			const feature = features.find((f) => f.id === featureId);

			if (!feature) {
				throw new RecaseError({
					message: `Feature ${featureId} not found`,
					code: ErrCode.InvalidFeature,
					statusCode: 404,
				});
			}

			// If only archiving, skip other checks and just update
			if (data.archived !== undefined && Object.keys(data).length === 1) {
				console.log("Updating feature archived to: ", data.archived);
				const updatedFeature = await FeatureService.update({
					db: req.db,
					id: featureId,
					orgId: req.orgId,
					env: req.env,
					updates: {
						archived: data.archived,
					},
				});

				if (res) {
					res
						.status(200)
						.json(
							updatedFeature
								? toApiFeature({ feature: updatedFeature })
								: undefined,
						);
				}
				return;
			}

			// 1. Check if changing type...
			const isChangingType =
				notNullish(data.type) && feature.type !== data.type;

			const isChangingId = notNullish(data.id) && feature.id !== data.id;

			const isChangingUsageType =
				feature.type !== FeatureType.Boolean &&
				data.type !== FeatureType.Boolean &&
				feature.config?.usage_type !== data.config?.usage_type;

			const isChangingName = feature.name !== data.name;

			if (isChangingType || isChangingId || isChangingUsageType) {
				const objectsUsingFeature = await getObjectsUsingFeature({
					db,
					orgId: req.orgId,
					env: req.env,
					allFeatures: features,
					feature,
				});

				// 1. Can't change type if any objects are linked to it
				if (isChangingType) {
					await handleFeatureTypeChanged({
						ctx: req,
						objectsUsingFeature,
						feature,
						newType: data.type,
					});
				}

				const { linkedEntitlements, entitlements, prices, creditSystems } =
					objectsUsingFeature;

				if (isChangingId) {
					await handleFeatureIdChanged({
						db,
						orgId,
						env,
						feature,
						linkedEntitlements,
						entitlements,
						prices,
						creditSystems,
						newId: data.id,
						logger,
					});
				}

				if (isChangingUsageType && data.config?.usage_type) {
					await handleFeatureUsageTypeChanged({
						db,
						feature,
						linkedEntitlements,
						entitlements,
						prices,
						creditSystems,
						newUsageType: data.config.usage_type,
					});
				}
			}

			const newConfig =
				data.config !== undefined
					? feature.type === FeatureType.CreditSystem
						? validateCreditSystem(data.config)
						: feature.type === FeatureType.Metered
							? validateMeteredConfig(data.config)
							: data.config
					: feature.config;

			const updatedFeature = await FeatureService.update({
				db: req.db,
				id: featureId,
				orgId: req.orgId,
				env: req.env,
				updates: {
					id: data.id !== undefined ? data.id : feature.id,
					name: data.name !== undefined ? data.name : feature.name,
					type: data.type !== undefined ? data.type : feature.type,
					archived:
						data.archived !== undefined ? data.archived : feature.archived,

					event_names: data.event_names,
					config: newConfig,
				},
			});

			if (isChangingName) {
				await addTaskToQueue({
					jobName: JobName.GenerateFeatureDisplay,
					payload: {
						feature: updatedFeature,
						org: req.org,
					},
				});
			}

			res
				.status(200)
				.json(
					updatedFeature
						? toApiFeature({ feature: updatedFeature })
						: undefined,
				);
		},
	});
