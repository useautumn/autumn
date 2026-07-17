import { expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	EntInterval,
	EntitlementSchema,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type ProductItem,
	ProductItemInterval,
	ProductItemSchema,
	ResetInterval,
} from "@autumn/shared";
import { ApiPlanItemV1Schema } from "@autumn/shared/api/products/items/apiPlanItemV1";
import { CreatePlanItemParamsV1Schema } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1";
import { planItemV0ToProductItem } from "@autumn/shared/api/products/items/mappers/planItemV0ToProductItem";
import { planItemV1ToV0 } from "@autumn/shared/api/products/items/mappers/planItemV1ToV0";
import { itemsAreSame } from "@autumn/shared/utils/productV2Utils/compareProductUtils/compareItemUtils";
import { productItemToPlanItemParamsV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemToPlanItemParamsV1";
import { productItemsToPlanItemsV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemToPlanItemV1";
import { itemToPriceAndEnt as sharedItemToPriceAndEnt } from "@autumn/shared/utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt";
import { toProductItem } from "@autumn/shared/utils/productV2Utils/productItemUtils/mapToItem";
import { itemToPriceAndEnt as serverItemToPriceAndEnt } from "@/internal/products/product-items/productItemUtils/itemToPriceAndEnt";

const orgId = "org_pooled_plan_item";
const internalProductId = "prod_internal_pooled_plan_item";
const now = 1_800_000_000_000;

const messagesFeature: Feature = {
	internal_id: "feat_internal_pooled_messages",
	id: "pooled-messages",
	name: "Pooled messages",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	org_id: orgId,
	env: AppEnv.Sandbox,
	created_at: now,
	archived: false,
	event_names: [],
};

const features = [messagesFeature];
const context = { features, expand: [] } as never;

const finiteMonthlyPlanItem = {
	feature_id: messagesFeature.id,
	included: 500,
	unlimited: false,
	reset: {
		interval: ResetInterval.Month,
		interval_count: 1,
	},
};

const expectPooled = (value: unknown, pooled: boolean) => {
	expect(value).toMatchObject({ pooled });
};

test.concurrent(
	"pooled plan-item schemas default to false and preserve explicit true",
	() => {
		const createDefault = CreatePlanItemParamsV1Schema.parse(
			finiteMonthlyPlanItem,
		);
		const createPooled = CreatePlanItemParamsV1Schema.parse({
			...finiteMonthlyPlanItem,
			pooled: true,
		});
		const responseDefault = ApiPlanItemV1Schema.parse({
			...finiteMonthlyPlanItem,
			price: null,
			reset: finiteMonthlyPlanItem.reset,
		});
		const responsePooled = ApiPlanItemV1Schema.parse({
			...finiteMonthlyPlanItem,
			pooled: true,
			price: null,
			reset: finiteMonthlyPlanItem.reset,
		});
		const productItemDefault = ProductItemSchema.parse({
			feature_id: messagesFeature.id,
			included_usage: 500,
			interval: ProductItemInterval.Month,
			interval_count: 1,
		});
		const productItemPooled = ProductItemSchema.parse({
			feature_id: messagesFeature.id,
			included_usage: 500,
			interval: ProductItemInterval.Month,
			interval_count: 1,
			pooled: true,
		});
		const entitlementDefault = EntitlementSchema.parse({
			id: "ent_schema_default",
			created_at: now,
			internal_feature_id: messagesFeature.internal_id,
			internal_product_id: internalProductId,
			internal_reward_id: null,
			is_custom: false,
			allowance_type: AllowanceType.Fixed,
			allowance: 500,
			interval: EntInterval.Month,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: null,
			usage_limit: null,
			rollover: null,
		});
		const entitlementPooled = EntitlementSchema.parse({
			...entitlementDefault,
			pooled: true,
		});

		expectPooled(createDefault, false);
		expectPooled(createPooled, true);
		expectPooled(responseDefault, false);
		expectPooled(responsePooled, true);
		expectPooled(productItemDefault, false);
		expectPooled(productItemPooled, true);
		expectPooled(entitlementDefault, false);
		expectPooled(entitlementPooled, true);
	},
);

test.concurrent(
	"pooled survives plan item, product item, entitlement, and response mappings",
	() => {
		const planItem = CreatePlanItemParamsV1Schema.parse({
			...finiteMonthlyPlanItem,
			pooled: true,
		});
		const legacyPlanItem = planItemV1ToV0({
			ctx: context,
			item: planItem,
		});
		const productItem = planItemV0ToProductItem({
			ctx: context,
			planItem: legacyPlanItem,
		});

		const sharedMapping = sharedItemToPriceAndEnt({
			item: productItem,
			orgId,
			internalProductId,
			feature: messagesFeature,
			isCustom: false,
			features,
		});
		const serverMapping = serverItemToPriceAndEnt({
			item: productItem,
			orgId,
			internalProductId,
			feature: messagesFeature,
			isCustom: false,
			features,
		});

		expectPooled(legacyPlanItem, true);
		expectPooled(productItem, true);
		expectPooled(sharedMapping.newEnt, true);
		expectPooled(serverMapping.newEnt, true);

		if (!sharedMapping.newEnt) {
			throw new Error("Expected the shared mapper to create an entitlement");
		}

		const persistedProductItem = toProductItem({
			ent: {
				...sharedMapping.newEnt,
				feature: messagesFeature,
			},
		});
		const [responsePlanItem] = productItemsToPlanItemsV1({
			items: [persistedProductItem],
			features,
		});
		const createPlanItem = productItemToPlanItemParamsV1({
			ctx: context,
			item: persistedProductItem,
		});

		expectPooled(persistedProductItem, true);
		expectPooled(responsePlanItem, true);
		expectPooled(createPlanItem, true);
	},
);

test.concurrent(
	"changing pooled versions the entitlement in both item mappers",
	() => {
		const nonPooledItem: ProductItem = {
			feature_id: messagesFeature.id,
			included_usage: 500,
			interval: ProductItemInterval.Month,
			interval_count: 1,
		};
		const initialMapping = sharedItemToPriceAndEnt({
			item: nonPooledItem,
			orgId,
			internalProductId,
			feature: messagesFeature,
			isCustom: false,
			features,
		});

		if (!initialMapping.newEnt) {
			throw new Error("Expected the initial mapping to create an entitlement");
		}

		const currentEntitlement = {
			...initialMapping.newEnt,
			pooled: false,
		};
		const pooledItem = {
			...nonPooledItem,
			pooled: true,
		};

		const sharedMapping = sharedItemToPriceAndEnt({
			item: pooledItem,
			orgId,
			internalProductId,
			feature: messagesFeature,
			curEnt: currentEntitlement,
			isCustom: false,
			features,
		});
		const serverMapping = serverItemToPriceAndEnt({
			item: pooledItem,
			orgId,
			internalProductId,
			feature: messagesFeature,
			curEnt: currentEntitlement,
			isCustom: false,
			features,
		});

		expect(sharedMapping.sameEnt).toBeNull();
		expect(serverMapping.sameEnt).toBeNull();
		expectPooled(sharedMapping.updatedEnt, true);
		expectPooled(serverMapping.updatedEnt, true);
	},
);

test.concurrent(
	"product-item comparison treats pooled as an entitlement-only change",
	() => {
		const nonPooledItem = {
			feature_id: messagesFeature.id,
			included_usage: 500,
			interval: ProductItemInterval.Month,
			interval_count: 1,
			pooled: false,
		};
		const pooledItem = {
			...nonPooledItem,
			pooled: true,
		};

		expect(
			itemsAreSame({
				item1: nonPooledItem,
				item2: pooledItem,
				features,
			}),
		).toEqual({
			same: false,
			pricesChanged: false,
		});
	},
);
