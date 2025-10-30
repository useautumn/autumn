import {
	type AppEnv,
	type Feature,
	FeatureType,
	type FullProduct,
	type Organization,
	type Price,
	PriceType,
	type RewardProgram,
	RewardType,
} from "@autumn/shared";
import axios from "axios";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features as v2Features } from "tests/setup/v2Features.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { RewardService } from "@/internal/rewards/RewardService.js";

export const getAxiosInstance = (
	apiKey: string = process.env.UNIT_TEST_AUTUMN_SECRET_KEY!,
) => {
	return axios.create({
		baseURL: "http://localhost:8080",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});
};

export const setupOrg = async ({
	orgId,
	env,
	features,
	products,
	rewards,
	rewardTriggers,
}: {
	orgId: string;
	env: AppEnv;
	features: Record<string, Feature & { eventName: string }>;
	products: Record<string, FullProduct | any>;
	rewards: Record<string, any>;
	rewardTriggers: Record<string, RewardProgram>;
}) => {
	const axiosInstance = getAxiosInstance();
	const { client, db } = initDrizzle();

	const autumn = new AutumnInt();

	const insertFeatures = [];
	for (const feature of Object.values(features)) {
		insertFeatures.push(axiosInstance.post("/v1/internal_features", feature));
	}

	await Promise.all(insertFeatures);

	await FeatureService.insert({
		db,
		data: Object.values(v2Features),
		logger: console,
	});

	let org: Organization | null = null;
	let newFeatures: Feature[] = [];
	try {
		org = await OrgService.get({ db, orgId });
		await OrgService.update({
			db,
			orgId,
			updates: {
				config: {
					...org.config,
					bill_upgrade_immediately: true,
				},
			},
		});

		newFeatures = (await FeatureService.list({ db, orgId, env })).filter((f) =>
			Object.keys(features).includes(f.id),
		);
	} catch (error) {
		console.error("Error updating org", error);
	}

	for (const feature of newFeatures!) {
		features[feature.id].internal_id = feature.internal_id;

		if (feature.type === FeatureType.Metered) {
			features[feature.id].eventName = feature.event_names?.[0] || feature.id;
		}
	}

	console.log("✅ Inserted features");

	// 2. Create products
	const insertProducts = [];

	const productValues = Object.values(products);
	const batchSize = 5;

	for (
		let batchStart = 0;
		batchStart < productValues.length;
		batchStart += batchSize
	) {
		const batch = productValues.slice(batchStart, batchStart + batchSize);
		const batchPromises = [];

		for (const product of batch) {
			const insertProduct = async () => {
				await autumn.products.create({
					id: product.id,
					name: product.name,
					group: product.group,
					is_add_on: product.is_add_on,
					is_default: product.is_default,
				});

				const prices = product.prices.map((p: any) => ({
					...p,
					config: {
						...p.config,
						internal_feature_id: newFeatures!.find(
							(f) => f.id === (p.config as any)?.feature_id,
						)?.internal_id,
					},
				}));

				const entitlements = Object.values(product.entitlements).map(
					(ent: any) => ({
						...ent,
						internal_feature_id: newFeatures!.find(
							(f) => f.id === ent.feature_id,
						)?.internal_id,
					}),
				);

				const entWithFeatures = entitlements.map((ent) => ({
					...ent,
					feature: newFeatures!.find((f) => f.id === ent.feature_id),
				}));

				const items = mapToProductItems({
					prices,
					entitlements: entWithFeatures,
					allowFeatureMatch: true,
					features: newFeatures!,
				});

				try {
					await axiosInstance.post(`/v1/products/${product.id}`, {
						items,
						free_trial: product.free_trial,
					});
				} catch (_error) {
					console.log("Product:", product.name);
					console.error("Error creating product prices / ents");
					console.log("Items", items);
				}
				return;
			};

			batchPromises.push(insertProduct());
		}

		await Promise.all(batchPromises);
		insertProducts.push(...batchPromises);
	}

	await Promise.all(insertProducts);
	console.log("✅ Inserted products");

	if (process.env.MOCHA_PARALLEL === "true") {
		console.log("MOCHA RUNNING IN PARALLEL");
		await AutumnCli.initStripeProducts();
		console.log("✅ Initialized stripe products / prices");
	} else {
		console.log("MOCHA RUNNING IN SERIAL");
	}

	// Fetch all products
	const { list: allProducts } = await AutumnCli.getProducts();
	const _productIds = allProducts.map((p: any) => p.id);

	// Insert coupons
	const insertCoupons = [];
	for (const reward of Object.values(rewards)) {
		const createReward = async () => {
			let priceIds = [];

			const rewardData: any = {
				id: reward.id,
				name: reward.name,
				promo_codes: [
					{
						code: reward.id,
					},
				],
				type: reward.type,
			};

			if (reward.type === RewardType.FreeProduct) {
				rewardData.free_product_id = reward.free_product_id;
				rewardData.free_product_config = reward.free_product_config;
			} else {
				if (reward.only_usage_prices) {
					const filteredProducts = allProducts.filter(
						(product: FullProduct) => {
							if (reward.product_ids) {
								return reward.product_ids.includes(product.id);
							}
							return true;
						},
					);

					priceIds = filteredProducts.flatMap((product: FullProduct) =>
						product.prices
							.filter((price: Price) => price.config!.type === PriceType.Usage)
							.map((price) => {
								return price.id;
							}),
					);
				} else if (reward.product_ids) {
					priceIds = allProducts
						.filter((product: FullProduct) =>
							reward.product_ids.includes(product.id),
						)
						.flatMap((product: FullProduct) =>
							product.prices.map((price) => price.id),
						);
				}

				rewardData.discount_config = {
					discount_value: reward.discount_config.discount_value,
					duration_type: reward.discount_config.duration_type,
					duration_value: reward.discount_config.duration_value,
					apply_to_all: reward.discount_config.apply_to_all,
					price_ids: priceIds,
				};
			}

			const newReward: any = {
				internal_id: reward.id,
				id: reward.id,
				name: reward.name,
				promo_codes: [
					{
						code: reward.id,
					},
				],
				type: reward.type,
				discount_config: rewardData.discount_config,
				free_product_id: rewardData.free_product_id,
				free_product_config:
					rewardData.free_product_config?.duration_type &&
					rewardData.free_product_config?.duration_value
						? rewardData.free_product_config
						: undefined,
			};

			const rewardRes = await autumn.rewards.create(newReward);

			return {
				id: reward.id,
				rewardRes,
			};
		};

		console.log("Creating reward", reward.id);
		insertCoupons.push(createReward());
	}

	await Promise.all(insertCoupons);
	console.log("✅ Inserted coupons");

	// CREATE REWARD TRIGGERS
	const insertRewardTriggers = [];
	const insertedRewards = await RewardService.list({ db, orgId, env });
	for (const rewardTrigger of Object.values(rewardTriggers)) {
		const rt = {
			...rewardTrigger,
			internal_reward_id: insertedRewards.find(
				(r) => r.id === rewardTrigger.internal_reward_id,
			)?.internal_id!,
		};
		insertRewardTriggers.push(autumn.rewardPrograms.create(rt));
	}
	await Promise.all(insertRewardTriggers);
	console.log("✅ Inserted reward triggers");

	await client.end();
};
