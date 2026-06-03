import {
	AppEnv,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getBillingInterval,
	pricesOnlyOneOff,
} from "@/internal/products/prices/priceUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	getRevenuecatAccessToken,
	getRevenuecatProjectId,
} from "../misc/getRevenuecatAccessToken.js";
import { initRevenuecatCli } from "../misc/initRevenuecatCli.js";
import { RCMappingService } from "../misc/RCMappingService.js";
import type { RevenueCatApp, RevenueCatProductType } from "../revenuecatTypes.js";
import {
	autumnIntervalToRcDuration,
	autumnIntervalToStoreDuration,
	getRcBasePrice,
	getRcStoreIdentifier,
	getSubscriptionGroupName,
	isRevenueCatPushEnabled,
} from "./revenuecatProductSyncUtils.js";

type RcCli = ReturnType<typeof initRevenuecatCli>;

type AppResult = {
	app_id: string;
	app_type: string;
	product: "created" | "updated" | "exists";
	store_push?: "pushed" | "failed" | "skipped";
	price?: "set" | "skipped" | "failed";
	message?: string;
};

export type ProductSyncResult = {
	plan_id: string;
	status: "synced" | "skipped" | "error";
	store_identifier?: string;
	apps?: AppResult[];
	message?: string;
};

/**
 * Push a single Autumn product into RevenueCat across every app: create the RC
 * product if missing (adopt on 409 via find), else patch its name; then (live only)
 * push it into the store via create_in_store. The minted store id is unioned into the
 * plan's revenuecat_mappings row — never replacing existing ids.
 */
export const syncProductToRevenueCat = async ({
	ctx,
	rcCli,
	apps,
	isLive,
	projectId,
	product,
}: {
	ctx: AutumnContext;
	rcCli: RcCli;
	apps: RevenueCatApp[];
	isLive: boolean;
	projectId: string;
	product: FullProduct;
}): Promise<ProductSyncResult> => {
	const { db, org, env, logger } = ctx;

	if (product.prices.length === 0) {
		return {
			plan_id: product.id,
			status: "skipped",
			message: "Free plan (no price) — nothing to sell in the store",
		};
	}

	let type: RevenueCatProductType;
	let isoDuration: string | null = null;
	let storeDuration = null as ReturnType<typeof autumnIntervalToStoreDuration>;

	if (pricesOnlyOneOff(product.prices)) {
		type = "one_time";
	} else {
		type = "subscription";
		const { interval, intervalCount } = getBillingInterval(product.prices);
		isoDuration = autumnIntervalToRcDuration({ interval, intervalCount });
		storeDuration = autumnIntervalToStoreDuration({ interval, intervalCount });
		if (!isoDuration) {
			return {
				plan_id: product.id,
				status: "skipped",
				message: `Unsupported billing interval (${interval} x${intervalCount}) for RevenueCat`,
			};
		}
	}

	const storeIdentifier = getRcStoreIdentifier({
		env,
		orgId: org.id,
		planId: product.id,
	});
	const displayName = product.name || product.id;
	const appResults: AppResult[] = [];

	for (const app of apps) {
		try {
			let rcProductId: string;
			let productAction: AppResult["product"];

			// RC only accepts subscription params on create for the simulated test store;
			// real store apps get a bare product, and duration is set via create_in_store.
			const isTestStore = app.type === "test_store";

			const existing = await rcCli.findProductByStoreIdentifier({
				appId: app.id,
				storeIdentifier,
			});

			if (existing) {
				rcProductId = existing.id;
				if (existing.display_name !== displayName) {
					await rcCli.updateProduct(existing.id, { display_name: displayName });
					productAction = "updated";
				} else {
					productAction = "exists";
				}
			} else {
				const created = await rcCli.createProduct({
					app_id: app.id,
					store_identifier: storeIdentifier,
					type,
					display_name: displayName,
					title: displayName,
					...(type === "subscription" && isTestStore
						? { subscription: { duration: isoDuration as string } }
						: {}),
					...(type === "one_time" ? { one_time: {} } : {}),
				});
				rcProductId = created.id;
				productAction = "created";
			}

			const appResult: AppResult = {
				app_id: app.id,
				app_type: app.type,
				product: productAction,
			};

			// Test-store products are already usable; only push real store apps (live).
			if (isLive && !isTestStore) {
				try {
					await rcCli.createInStore(
						rcProductId,
						type === "subscription" && storeDuration
							? {
									store_information: {
										duration: storeDuration,
										subscription_group_name: getSubscriptionGroupName(
											product.group,
										),
									},
								}
							: undefined,
					);
					appResult.store_push = "pushed";
				} catch (storeError) {
					appResult.store_push = "failed";
					appResult.message = `${storeError}. Check the app's store credentials at https://app.revenuecat.com/projects/${projectId}/apps/${app.id}`;
					logger.warn(
						`[RC sync] create_in_store failed for ${product.id} / app ${app.id}: ${storeError}`,
					);
				}
			} else {
				appResult.store_push = "skipped";
			}

			// Real-store prices come from Apple/Google. Only the test store needs an
			// explicit price, set via RC's MCP server (no REST endpoint for it).
			if (isTestStore) {
				const basePrice = getRcBasePrice({ product, org });
				if (basePrice) {
					try {
						await rcCli.setTestStoreProductPrice(rcProductId, basePrice);
						appResult.price = "set";
					} catch (priceError) {
						appResult.price = "failed";
						appResult.message = `Price not set: ${priceError}`;
						logger.warn(
							`[RC sync] set test-store price failed for ${product.id} / app ${app.id}: ${priceError}`,
						);
					}
				} else {
					appResult.price = "skipped";
				}
			}

			appResults.push(appResult);
		} catch (error) {
			appResults.push({
				app_id: app.id,
				app_type: app.type,
				product: "exists",
				store_push: "failed",
				message: `${error}`,
			});
			logger.error(
				`[RC sync] Failed to sync ${product.id} for app ${app.id}: ${error}`,
				{ error },
			);
		}
	}

	// Union the minted id into the mapping — never clobber existing manual ids.
	const existingRows = await RCMappingService.get({
		db,
		orgId: org.id,
		env,
		autumnProductId: product.id,
	});
	const currentIds = existingRows[0]?.revenuecat_product_ids ?? [];
	const revenuecat_product_ids = currentIds.includes(storeIdentifier)
		? currentIds
		: [...currentIds, storeIdentifier];

	await RCMappingService.upsert({
		db,
		data: {
			org_id: org.id,
			env,
			autumn_product_id: product.id,
			revenuecat_product_ids,
		},
	});

	return {
		plan_id: product.id,
		status: "synced",
		store_identifier: storeIdentifier,
		apps: appResults,
	};
};

/**
 * On-demand push of selected Autumn plans into RevenueCat. Throws only if
 * RevenueCat isn't connected / has no apps; per-product issues are collected.
 */
export const syncProductsToRevenueCat = async ({
	ctx,
	productIds,
}: {
	ctx: AutumnContext;
	productIds: string[];
}): Promise<ProductSyncResult[]> => {
	const { db, org, env } = ctx;

	const revenueCatConfig = org.processor_configs?.revenuecat;
	if (!revenueCatConfig || !isRevenueCatPushEnabled({ revenueCatConfig, env })) {
		throw new RecaseError({
			message: "Connect RevenueCat via OAuth for this environment before syncing",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const projectId = getRevenuecatProjectId({ revenueCatConfig, env });
	const accessToken = await getRevenuecatAccessToken({ db, org, env });
	if (!projectId || !accessToken) {
		throw new RecaseError({
			message: "RevenueCat is not fully configured (missing project or token)",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const rcCli = initRevenuecatCli({ projectId, accessToken });
	const apps = await rcCli.listApps();
	if (apps.length === 0) {
		throw new RecaseError({
			message:
				"No apps configured in this RevenueCat project. Add one in the RevenueCat dashboard first.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const isLive = env === AppEnv.Live;
	const results: ProductSyncResult[] = [];

	for (const planId of productIds) {
		const product = await ProductService.getFull({
			db,
			idOrInternalId: planId,
			orgId: org.id,
			env,
			allowNotFound: true,
		});

		if (!product) {
			results.push({ plan_id: planId, status: "error", message: "Plan not found" });
			continue;
		}

		results.push(
			await syncProductToRevenueCat({
				ctx,
				rcCli,
				apps,
				isLive,
				projectId,
				product,
			}),
		);
	}

	return results;
};
