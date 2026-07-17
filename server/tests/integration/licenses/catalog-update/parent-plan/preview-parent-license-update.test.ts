/** Contract: license_changes combines link snapshots with effective child-plan diffs.
 * Baselines use the parent link's persisted customization and previews are read-only. */
import { expect, test } from "bun:test";
import {
	BillingInterval,
	type PlanUpdatePreview,
	PreviewUpdatePlanExpand,
	productToBasePrice,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { buildCustomizedLicenseEntry } from "../utils/buildCustomizedLicenseEntry.js";
import { getFullLicenseProduct } from "../utils/getFullLicenseProduct.js";

const onlyLicenseChange = (preview: PlanUpdatePreview) => {
	expect(preview.license_changes).toHaveLength(1);
	return preview.license_changes[0]!;
};

test.concurrent(
	`${chalk.yellowBright("plans.preview_update: resolves parent-specific effective license diffs")}`,
	async () => {
		const customerId = "license-parent-preview-effective-diffs";
		const parent = products.base({
			id: "license-preview-parent",
			items: [items.dashboard()],
		});
		const license = products.pro({
			id: "license-preview-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.billing.attach({ productId: parent.id }),
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 0,
				}),
			],
		});
		const persistedEntry = buildCustomizedLicenseEntry({
			licensePlanId: license.id,
			price: 25,
			messages: 50,
			words: 10,
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [persistedEntry],
			disable_version: true,
		});

		const before = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: license.id,
		});
		expect(
			productToBasePrice({ product: before.fullLicenseProduct }),
		).toMatchObject({
			config: { amount: 25, interval: BillingInterval.Month },
		});
		expect(before.fullLicenseProduct.entitlements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					allowance: 50,
				}),
				expect.objectContaining({
					feature_id: TestFeature.Words,
					allowance: 10,
				}),
			]),
		);

		const parentOnly = await autumnV2_3.plans.previewUpdate({
			plan_id: parent.id,
			name: "Renamed parent",
		});
		expect(parentOnly).toMatchObject({
			plan_id: parent.id,
			has_customers: true,
			customer_count: 1,
			versionable: false,
			previous_attributes: { name: parent.name },
			license_changes: [],
		});

		const includedPreview = await autumnV2_3.plans.previewUpdate({
			plan_id: parent.id,
			licenses: [
				{
					...persistedEntry,
					included: 3,
				},
			],
		});
		expect(includedPreview.versionable).toBe(true);
		expect(onlyLicenseChange(includedPreview)).toMatchObject({
			action: "update",
			license_plan_id: license.id,
			version: 1,
			included: 3,
			prepaid_only: true,
			customize: persistedEntry.customize,
			previous_attributes: { included: 0 },
			plan_changes: null,
		});

		const basePricePreview = await autumnV2_3.plans.previewUpdate({
			plan_id: parent.id,
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 30,
					messages: 50,
					words: 10,
				}),
			],
			expand: [PreviewUpdatePlanExpand.Plan],
		});
		expect(basePricePreview).toMatchObject({
			customize: null,
			item_changes: [],
			versionable: true,
		});
		expect(basePricePreview.price_change).toBeUndefined();
		const basePriceLicense = onlyLicenseChange(basePricePreview);
		expect(basePriceLicense).toMatchObject({
			action: "update",
			license_plan_id: license.id,
			version: 1,
			included: 0,
			prepaid_only: true,
			customize: {
				price: { amount: 30, interval: BillingInterval.Month },
			},
			previous_attributes: null,
			plan_changes: {
				plan_id: license.id,
				plan: {
					id: license.id,
					price: { amount: 30, interval: BillingInterval.Month },
				},
				customize: {
					price: { amount: 30, interval: BillingInterval.Month },
				},
				previous_attributes: null,
				price_change: {
					previous: { amount: 25, interval: BillingInterval.Month },
					current: { amount: 30, interval: BillingInterval.Month },
				},
				item_changes: [],
			},
		});
		expect("has_customers" in basePriceLicense.plan_changes!).toBe(false);
		expect("customer_count" in basePriceLicense.plan_changes!).toBe(false);
		expect("versionable" in basePriceLicense.plan_changes!).toBe(false);
		expect("license_changes" in basePriceLicense.plan_changes!).toBe(false);

		const addItemPreview = await autumnV2_3.plans.previewUpdate({
			plan_id: parent.id,
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 25,
					messages: 50,
					words: 10,
					credits: 5,
				}),
			],
		});
		const addItemLicense = onlyLicenseChange(addItemPreview);
		expect(addItemLicense.plan_changes?.customize).toMatchObject({
			add_items: [
				{
					feature_id: TestFeature.Credits,
					included: 5,
					reset: { interval: ResetInterval.Month },
				},
			],
		});
		expect(addItemLicense.plan_changes?.price_change).toBeUndefined();
		expect(addItemLicense.plan_changes?.item_changes).toEqual([
			expect.objectContaining({
				action: "created",
				feature_id: TestFeature.Credits,
				item: expect.objectContaining({ included: 5 }),
			}),
		]);

		const removeItemPreview = await autumnV2_3.plans.previewUpdate({
			plan_id: parent.id,
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 25,
					messages: 50,
				}),
			],
		});
		const removeItemLicense = onlyLicenseChange(removeItemPreview);
		expect(removeItemLicense.plan_changes?.customize).toMatchObject({
			remove_items: [
				expect.objectContaining({ feature_id: TestFeature.Words }),
			],
		});
		expect(removeItemLicense.plan_changes?.price_change).toBeUndefined();
		expect(removeItemLicense.plan_changes?.item_changes).toEqual([
			expect.objectContaining({
				action: "deleted",
				feature_id: TestFeature.Words,
				item: expect.objectContaining({ included: 10 }),
			}),
		]);

		const mixedPreview = await autumnV2_3.plans.previewUpdate({
			plan_id: parent.id,
			items: [
				{ feature_id: TestFeature.Dashboard },
				{
					feature_id: TestFeature.Credits,
					included: 100,
					reset: { interval: ResetInterval.Month },
				},
			],
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 35,
					messages: 75,
					credits: 5,
				}),
			],
		});
		expect(mixedPreview.customize).toMatchObject({
			add_items: [
				expect.objectContaining({
					feature_id: TestFeature.Credits,
					included: 100,
				}),
			],
		});
		expect(mixedPreview.item_changes).toEqual([
			expect.objectContaining({
				action: "created",
				feature_id: TestFeature.Credits,
				item: expect.objectContaining({ included: 100 }),
			}),
		]);
		const mixedLicense = onlyLicenseChange(mixedPreview);
		expect(mixedLicense.plan_changes?.price_change).toMatchObject({
			previous: { amount: 25 },
			current: { amount: 35 },
		});
		expect(mixedLicense.plan_changes?.item_changes).toHaveLength(4);
		expect(mixedLicense.plan_changes?.item_changes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					action: "deleted",
					feature_id: TestFeature.Messages,
					item: expect.objectContaining({ included: 50 }),
				}),
				expect.objectContaining({
					action: "deleted",
					feature_id: TestFeature.Words,
					item: expect.objectContaining({ included: 10 }),
				}),
				expect.objectContaining({
					action: "created",
					feature_id: TestFeature.Messages,
					item: expect.objectContaining({ included: 75 }),
				}),
				expect.objectContaining({
					action: "created",
					feature_id: TestFeature.Credits,
					item: expect.objectContaining({ included: 5 }),
				}),
			]),
		);

		const [after, parentAfter, stockLicenseAfter] = await Promise.all([
			getFullLicenseProduct({
				ctx,
				parentPlanId: parent.id,
				licensePlanId: license.id,
			}),
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: parent.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: license.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);
		expect(after.planLicense.id).toBe(before.planLicense.id);
		expect(
			productToBasePrice({ product: after.fullLicenseProduct }),
		).toMatchObject({
			config: { amount: 25 },
		});
		expect(parentAfter).toMatchObject({ version: 1, name: parent.name });
		expect(productToBasePrice({ product: stockLicenseAfter })).toMatchObject({
			config: { amount: 20 },
		});
	},
);
