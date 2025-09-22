import { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId, keyToTitle } from "@/utils/genUtils.js";
import {
	FeatureType,
	AggregateType,
	FeatureUsageType,
	EntInterval,
	AllowanceType,
	PriceType,
	BillingInterval,
	// DB Models
	entitlements,
	prices,
	features,
	products,
} from "@autumn/shared";

import { AppEnv } from "autumn-js";

const defaultFeatures = [
	{
		internal_id: "",
		id: "pro_analytics",
		type: FeatureType.Boolean,
		display: {
			singular: "pro analytics",
			plural: "pro analytics",
		},
	},
	{
		internal_id: "",
		id: "chat_messages",
		type: FeatureType.Metered,
		config: {
			filters: [
				{
					value: ["chat_messages"],
					property: "",
					operator: "",
				},
			],
			aggregate: {
				type: AggregateType.Count,
			},
			usage_type: FeatureUsageType.Single,
			display: {
				singular: "chat message",
				plural: "chat messages",
			},
		},
	},
];

export const createOnboardingProducts = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}) => {
	const env = AppEnv.Sandbox;
	const insertedFeatures = defaultFeatures.map((f) => ({
		...f,
		org_id: orgId,
		env,
		internal_id: generateId("fe"),
		name: keyToTitle(f.id),
		created_at: Date.now(),
	}));

	await db.insert(features).values(insertedFeatures as any);

	const defaultProducts = [
		{
			id: "free_example",
			name: "Free (Example)",
			env: AppEnv.Sandbox,
			is_default: true,
			entitlements: [
				{
					internal_feature_id: insertedFeatures[1].internal_id,
					feature_id: insertedFeatures[1].id,
					allowance: 10,
					interval: EntInterval.Month,
					allowance_type: AllowanceType.Fixed,
				},
			],
			prices: [],
		},
		{
			id: "pro_example",
			name: "Pro (Example)",
			env: AppEnv.Sandbox,
			is_default: false,
			entitlements: [
				{
					internal_feature_id: insertedFeatures[0].internal_id,
					feature_id: insertedFeatures[0].id,
				},
				{
					internal_feature_id: insertedFeatures[1].internal_id,
					feature_id: insertedFeatures[1].id,
					allowance_type: AllowanceType.Unlimited,
				},
			],
			prices: [
				{
					name: "Monthly",
					config: {
						type: PriceType.Fixed,
						amount: 20.5,
						interval: BillingInterval.Month,
					},
				},
			],
		},
	];

	const batchInsert = [];
	for (const product of defaultProducts) {
		const insertProduct = async (product: any) => {
			let internalProductId = generateId("pr");

			await db.insert(products).values({
				...product,
				internal_id: internalProductId,
				org_id: orgId,
				env,
				group: "",
				is_add_on: false,
				created_at: Date.now(),
				version: 1,
			});

			for (const entitlement of product.entitlements) {
				await db.insert(entitlements).values({
					...entitlement,
					id: generateId("en"),
					org_id: orgId,
					env,
					created_at: Date.now(),
				});
			}

			for (const price of product.prices) {
				await db.insert(prices).values({
					...price,
					id: generateId("pr"),
					internal_product_id: internalProductId,
					created_at: Date.now(),
					org_id: orgId,
				});
			}
		};

		batchInsert.push(insertProduct(product));
	}

	await Promise.all(batchInsert);
};
