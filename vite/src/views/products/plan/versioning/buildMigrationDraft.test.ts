import { expect, test } from "bun:test";
import {
	AppEnv,
	type Feature,
	FeatureType,
	type FrontendProduct,
	type ProductItem,
	ProductItemFeatureType,
} from "@autumn/shared";
import { buildVersionMigrationDraft } from "./buildMigrationDraft";

const dashboard = {
	id: "dashboard",
	internal_id: "feat_dashboard",
	name: "Dashboard",
	type: FeatureType.Boolean,
	org_id: "org_1",
	env: AppEnv.Sandbox,
	created_at: 0,
	config: null,
	archived: false,
} as unknown as Feature;

const dashboardItem = {
	feature_id: dashboard.id,
	feature_type: ProductItemFeatureType.Static,
} as ProductItem;

const product = ({
	version,
	items,
}: {
	version: number;
	items: ProductItem[];
}): FrontendProduct => ({
	id: "pro",
	name: "Pro",
	description: null,
	items,
	archived: false,
	created_at: 0,
	is_add_on: false,
	is_default: false,
	version,
	version_slug: `v${version}`,
	active: true,
	group: null,
	env: AppEnv.Sandbox,
	internal_id: `pro_v${version}`,
	planType: "free",
	basePriceType: "recurring",
});

const latestProduct = product({ version: 3, items: [dashboardItem] });
const versionProducts = new Map([
	[1, product({ version: 1, items: [] })],
	[2, product({ version: 2, items: [dashboardItem] })],
]);

test("version drafts pair the target version with the item diff from each source version", () => {
	const draft = buildVersionMigrationDraft({
		productId: "pro",
		latestVersion: 3,
		scope: "all",
		pastVersions: [1, 2],
		hasPricingChange: false,
		latestProduct,
		versionProducts,
		features: [dashboard],
	});

	expect(draft.filter).toEqual({
		customer: {
			plan: { plan_id: "pro", version: { $in: [1, 2] }, custom: false },
		},
	});
	expect(draft.operations.customer).toHaveLength(2);

	const [fromV1, fromV2] = draft.operations.customer ?? [];
	expect(fromV1).toMatchObject({
		type: "update_plan",
		plan_filter: { plan_id: "pro", version: 1, custom: false },
		version: 3,
	});
	expect(
		fromV1?.type === "update_plan" ? fromV1.customize?.add_items : undefined,
	).toEqual([expect.objectContaining({ feature_id: "dashboard" })]);

	expect(fromV2).toMatchObject({
		type: "update_plan",
		plan_filter: { plan_id: "pro", version: 2, custom: false },
		version: 3,
	});
	expect(fromV2 && "customize" in fromV2).toBe(false);
});

test("a single-version scope pins that version and keeps custom plans out unless asked", () => {
	const draft = buildVersionMigrationDraft({
		productId: "pro",
		latestVersion: 3,
		scope: 1,
		pastVersions: [1, 2],
		hasPricingChange: false,
		includeCustom: true,
		latestProduct,
		versionProducts,
		features: [dashboard],
	});
	expect(draft.filter).toEqual({
		customer: { plan: { plan_id: "pro", version: 1 } },
	});
	expect(draft.operations.customer?.[0]).toMatchObject({
		plan_filter: { plan_id: "pro", version: 1 },
		version: 3,
		customize: {
			add_items: [expect.objectContaining({ feature_id: "dashboard" })],
		},
	});
	expect(draft.no_billing_changes).toBe(true);
});
