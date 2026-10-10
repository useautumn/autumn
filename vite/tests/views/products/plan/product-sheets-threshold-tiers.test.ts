import { expect, test } from "bun:test";
import {
	AppEnv,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FrontendProduct,
	Infinite,
	type ProductItem,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import type { DraftItemSession } from "@/hooks/inline-editor/useItemDraftController";
import { getItemId } from "@/utils/product/productItemUtils";
import { buildCatalogUpdatePlans } from "@/views/products/plan/catalog/buildUpdateCatalogPlanParams";
import { applySheetItemEdit } from "@/views/products/plan/utils/applySheetItemEdit";
import { addTier } from "@/views/products/plan/utils/tierUtils";

// ProductSheets' feature-sheet setter: adding a second tier must drop threshold billing before save.

const features: Feature[] = [
	{
		internal_id: "fe_messages",
		org_id: "org_1",
		created_at: 1,
		env: AppEnv.Sandbox,
		id: "messages",
		name: "Messages",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Single },
		display: null,
		archived: false,
		event_names: [],
	},
];

const thresholdItem: ProductItem = {
	feature_id: "messages",
	included_usage: 0,
	interval: ProductItemInterval.Month,
	usage_model: UsageModel.PayPerUse,
	tiers: [{ to: Infinite, amount: 0.5 }],
	billing_units: 1,
	config: { threshold_billing: { threshold: 50 } },
};

const product: FrontendProduct = {
	id: "pro",
	name: "Pro",
	is_add_on: false,
	is_default: false,
	version: 1,
	group: "core",
	env: AppEnv.Sandbox,
	free_trial: null,
	items: [thresholdItem],
	created_at: 1,
	archived: false,
	planType: "paid",
	basePriceType: "usage",
} as FrontendProduct;

const itemId = getItemId({ item: thresholdItem, itemIndex: 0 });

const savedItemsFor = ({
	editedProduct,
}: {
	editedProduct: FrontendProduct;
}) => {
	const [plan] = buildCatalogUpdatePlans({
		baseProduct: product,
		editedProduct,
		features,
	});
	return plan.items ?? [];
};

test("adding a second tier on the plan drops threshold billing from the save payload", () => {
	let editedProduct = product;
	addTier({
		item: thresholdItem,
		setItem: (nextItem) =>
			applySheetItemEdit({
				nextItem,
				itemId,
				itemDraft: { enabled: false, session: null, updateItem: () => {} },
				product,
				itemIndex: 0,
				setProduct: (next) => {
					editedProduct = next;
				},
				onItemIdChange: () => {},
			}),
	});

	expect(editedProduct.items[0].tiers).toHaveLength(2);
	expect(editedProduct.items[0].config?.threshold_billing).toBeUndefined();

	const [savedItem] = savedItemsFor({ editedProduct });
	expect(savedItem.price?.tiers).toHaveLength(2);
	expect(savedItem.threshold_billing ?? null).toBeNull();
});

test("adding a second tier inside an item draft drops threshold billing too", () => {
	const session: DraftItemSession = {
		itemId,
		itemIndex: 0,
		initialItem: thresholdItem,
		draftItem: thresholdItem,
	};
	let draftItem = thresholdItem;
	addTier({
		item: thresholdItem,
		setItem: (nextItem) =>
			applySheetItemEdit({
				nextItem,
				itemId,
				itemDraft: {
					enabled: true,
					session,
					updateItem: ({ item }) => {
						draftItem = item;
					},
				},
				product,
				itemIndex: 0,
				setProduct: () => {
					throw new Error("draft edits must not write the plan directly");
				},
				onItemIdChange: () => {},
			}),
	});

	expect(draftItem.tiers).toHaveLength(2);
	const [savedItem] = savedItemsFor({
		editedProduct: { ...product, items: [draftItem] },
	});
	expect(savedItem.threshold_billing ?? null).toBeNull();
});

test("a single-tier edit keeps threshold billing", () => {
	let editedProduct = product;
	applySheetItemEdit({
		nextItem: { ...thresholdItem, billing_units: 10 },
		itemId,
		itemDraft: { enabled: false, session: null, updateItem: () => {} },
		product,
		itemIndex: 0,
		setProduct: (next) => {
			editedProduct = next;
		},
		onItemIdChange: () => {},
	});

	const [savedItem] = savedItemsFor({ editedProduct });
	expect(savedItem.threshold_billing).toEqual({ threshold: 50 });
});
