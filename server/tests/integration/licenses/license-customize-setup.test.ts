import { expect, test } from "bun:test";
import { BillingInterval, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setupCustomPlanLicenses } from "@/internal/licenses/actions/customize/setupCustomPlanLicenses.js";
import { ProductService } from "@/internal/products/ProductService.js";

const makeParentProduct = (id: string) =>
	products.base({ id, items: [items.dashboard()] });

const makeLicenseProduct = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

const setupLinkedParent = async ({
	customerId,
	idPrefix,
	included = 2,
}: {
	customerId: string;
	idPrefix: string;
	included?: number;
}) => {
	const parent = makeParentProduct(`${idPrefix}-parent`);
	const license = makeLicenseProduct(`${idPrefix}-seat`);
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [parent, license] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: license.id,
				included,
			}),
		],
	});
	const { ctx } = scenario;
	const parentFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: parent.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const licenseFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: license.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return { ...scenario, parent, license, parentFull, licenseFull };
};

test.concurrent(
	`${chalk.yellowBright("licenses-customize-setup: price-only diff reuses unchanged entitlement rows")}`,
	async () => {
		const { ctx, parentFull, licenseFull } = await setupLinkedParent({
			customerId: "lic-resolver-price-only",
			idPrefix: "lic-resolver-price-only",
		});
		const stockEntitlementIds = licenseFull.entitlements.map((ent) => ent.id);

		const resolved = await setupCustomPlanLicenses({
			ctx,
			parentProduct: parentFull,
			upsertLicenses: [
				{
					license_plan_id: licenseFull.id,
					customize: {
						price: { amount: 5, interval: BillingInterval.Month },
					},
				},
			],
		});

		expect(resolved.insertPlanLicenses).toHaveLength(1);
		const { row, items: itemRefs } = resolved.insertPlanLicenses[0];
		expect(row).toMatchObject({
			is_custom: true,
			customized: true,
			included: 2,
			prepaid_only: true,
			parent_internal_product_id: parentFull.internal_id,
			license_internal_product_id: licenseFull.internal_id,
		});

		// New base price is custom; the untouched messages entitlement keeps its
		// stock row id.
		const spec = resolved.insertPlanLicenses[0];
		expect(spec.customPrices).toHaveLength(1);
		expect(spec.customEntitlements).toHaveLength(0);
		const effective = resolved.planLicenses[0].product;
		for (const ent of effective.entitlements) {
			expect(stockEntitlementIds).toContain(ent.id);
		}
		expect(
			itemRefs.filter((ref) => ref.priceId === spec.customPrices[0].id),
		).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-customize-setup: add/remove items patch the license item set")}`,
	async () => {
		const { ctx, parentFull, licenseFull } = await setupLinkedParent({
			customerId: "lic-resolver-patch-items",
			idPrefix: "lic-resolver-patch-items",
		});

		const resolved = await setupCustomPlanLicenses({
			ctx,
			parentProduct: parentFull,
			upsertLicenses: [
				{
					license_plan_id: licenseFull.id,
					customize: {
						add_items: [itemsV2.monthlyWords({ included: 100 })],
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		});

		const effective = resolved.planLicenses[0].product;
		const featureIds = effective.entitlements.map(
			(ent) => ent.feature?.id ?? ent.feature_id,
		);
		expect(featureIds).toContain(TestFeature.Words);
		expect(featureIds).not.toContain(TestFeature.Messages);
		expect(resolved.insertPlanLicenses[0].customEntitlements).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-customize-setup: included-only override keeps stock items, no junction rows")}`,
	async () => {
		const { ctx, parentFull, licenseFull } = await setupLinkedParent({
			customerId: "lic-resolver-included-only",
			idPrefix: "lic-resolver-included-only",
		});

		const resolved = await setupCustomPlanLicenses({
			ctx,
			parentProduct: parentFull,
			upsertLicenses: [{ license_plan_id: licenseFull.id, included: 5 }],
		});

		expect(resolved.insertPlanLicenses).toHaveLength(1);
		const { row, items: itemRefs } = resolved.insertPlanLicenses[0];
		expect(row).toMatchObject({
			is_custom: true,
			customized: false,
			included: 5,
		});
		expect(itemRefs).toHaveLength(0);
		expect(resolved.insertPlanLicenses[0].customPrices).toHaveLength(0);
		expect(resolved.insertPlanLicenses[0].customEntitlements).toHaveLength(0);
		expect(resolved.planLicenses[0].product.internal_id).toBe(
			licenseFull.internal_id,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-customize-setup: bare entry matching catalog resolves to inheritance")}`,
	async () => {
		const { ctx, parentFull, licenseFull } = await setupLinkedParent({
			customerId: "lic-resolver-bare-entry",
			idPrefix: "lic-resolver-bare-entry",
		});

		const resolved = await setupCustomPlanLicenses({
			ctx,
			parentProduct: parentFull,
			upsertLicenses: [{ license_plan_id: licenseFull.id }],
		});

		expect(resolved.insertPlanLicenses).toHaveLength(0);
		expect(resolved.planLicenses).toEqual(parentFull.licenses ?? []);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-customize-setup: non-catalog license appends a custom link with included 1")}`,
	async () => {
		const { ctx, parentFull } = await setupLinkedParent({
			customerId: "lic-resolver-new-license",
			idPrefix: "lic-resolver-new-license",
		});
		const extraLicense = makeLicenseProduct("lic-resolver-new-license-extra");
		const { ctx: _unused } = await initScenario({
			customerId: "lic-resolver-new-license-aux",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [extraLicense] }),
			],
			actions: [],
		});

		const resolved = await setupCustomPlanLicenses({
			ctx,
			parentProduct: parentFull,
			upsertLicenses: [{ license_plan_id: extraLicense.id }],
		});

		expect(resolved.insertPlanLicenses).toHaveLength(1);
		expect(resolved.insertPlanLicenses[0].row).toMatchObject({
			is_custom: true,
			included: 1,
			customized: false,
		});
		expect(resolved.planLicenses).toHaveLength(
			(parentFull.licenses?.length ?? 0) + 1,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-customize-setup: prepaid_only false rejects")}`,
	async () => {
		const { ctx, parentFull, licenseFull } = await setupLinkedParent({
			customerId: "lic-resolver-overflow",
			idPrefix: "lic-resolver-overflow",
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				setupCustomPlanLicenses({
					ctx,
					parentProduct: parentFull,
					upsertLicenses: [
						{ license_plan_id: licenseFull.id, prepaid_only: false },
					],
				}),
		});
	},
);
