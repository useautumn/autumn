/**
 * catalogV2 and the legacy allocated-usage-based ("prorated") price shape.
 *
 * Contract — `price.allocated_billing` on a usage_based allocated item:
 *   C1  GET emits `allocated_billing: "prorated_legacy"` on a legacy row and
 *       nothing on a v2 (arrear) row.
 *   C2  preview_update of exactly what GET returned is a no-op (`action: none`).
 *   C3  update with `allocated_billing: "prorated_legacy"` keeps the legacy row
 *       (no retire, no mint, same price id).
 *   C4  update that omits the field migrates the row to arrear — the explicit
 *       "I've moved on" signal.
 *   C5  a fresh plan created with the field omitted is arrear, and GET stays bare.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	BillingInterval,
	BillingMethod,
	type CreatePlanItemParamsV1,
} from "@autumn/shared";
import { AllocatedBilling } from "@autumn/shared/api/products/components/allocatedBilling";
import {
	expectAllocatedV1Price,
	expectAllocatedV2Price,
	forceOldAllocatedV1Config,
	getUsersPrice,
} from "@tests/integration/crud/plans/utils/allocatedV1Utils";
import { TestFeature } from "@tests/setup/v2Features";
import { pulledPlanToWire } from "@tests/unit/catalogV2/roundTrip/catalogRoundTrip";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { parsePlanPreview } from "../preview/utils/expectPlanPreview";

const allocatedUsersItem = ({
	allocatedBilling,
}: {
	allocatedBilling?: AllocatedBilling;
} = {}): CreatePlanItemParamsV1 => ({
	feature_id: TestFeature.Users,
	included: 1,
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
		...(allocatedBilling ? { allocated_billing: allocatedBilling } : {}),
	},
});

const usersItemOf = (plan: { items: ApiPlanItemV1[] }): ApiPlanItemV1 => {
	const item = plan.items.find((item) => item.feature_id === TestFeature.Users);
	if (!item) throw new Error("Users item not found");
	return item;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 allocated_billing: legacy row surfaces on GET and stays legacy on an explicit push")}`,
	async () => {
		const pro = products.pro({
			id: "cv2_alloc_legacy_roundtrip",
			items: [items.allocatedUsers({ includedUsage: 1 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "cv2-alloc-legacy-roundtrip",
			setup: [s.products({ list: [pro] })],
			actions: [],
		});
		await forceOldAllocatedV1Config({ ctx, planId: pro.id });
		const before = await getUsersPrice({ ctx, planId: pro.id });

		// C1: GET says it's legacy.
		const catalog = await autumnV2_3.catalogV2.get();
		const plan = catalog.plans.find((row) => row.id === pro.id);
		if (!plan) throw new Error("plan missing from catalog");
		expect(usersItemOf(plan).price?.allocated_billing).toBe(
			AllocatedBilling.ProratedLegacy,
		);

		// C3: explicit legacy keeps the row, same price id.
		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: pro.id,
					items: [
						{
							...allocatedUsersItem({
								allocatedBilling: AllocatedBilling.ProratedLegacy,
							}),
							proration: usersItemOf(plan).proration,
						},
					],
				},
			],
		});
		await expectAllocatedV1Price({ ctx, planId: pro.id });
		const after = await getUsersPrice({ ctx, planId: pro.id });
		expect(after.id).toBe(before.id);
	},
);

// C2 rides the atmn emitter, which only carries fields in its generated spec.
// Green once `openapi-internal.yml` and packages/atmn-nightly are regenerated
// with `price.allocated_billing`; until then the emitter drops the flag and
// the push reads as a migration.
test.todo(
	`${chalk.yellowBright("catalogV2 allocated_billing: what atmn pull writes for a legacy row pushes back as a no-op")}`,
	async () => {
		const pro = products.pro({
			id: "cv2_alloc_legacy_pull_noop",
			items: [items.allocatedUsers({ includedUsage: 1 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "cv2-alloc-legacy-pull-noop",
			setup: [s.products({ list: [pro] })],
			actions: [],
		});
		await forceOldAllocatedV1Config({ ctx, planId: pro.id });

		const catalog = await autumnV2_3.catalogV2.get();
		const plan = catalog.plans.find((row) => row.id === pro.id);
		if (!plan) throw new Error("plan missing from catalog");

		const preview = parsePlanPreview(
			await autumnV2_3.catalogV2.previewUpdate({
				plans: [
					pulledPlanToWire({
						plan: plan as unknown as Record<string, unknown>,
						featureTypes: Object.fromEntries(
							catalog.features.map((feature) => [feature.id, feature.type]),
						),
					}),
				],
			} as never),
		);
		const row = preview.plans.find((entry) => entry.plan_id === pro.id);
		expect(row?.action).toBe("none");
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 allocated_billing: omitting the field migrates a legacy row to arrear")}`,
	async () => {
		const pro = products.pro({
			id: "cv2_alloc_legacy_migrate",
			items: [items.allocatedUsers({ includedUsage: 1 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "cv2-alloc-legacy-migrate",
			setup: [s.products({ list: [pro] })],
			actions: [],
		});
		await forceOldAllocatedV1Config({ ctx, planId: pro.id });
		await expectAllocatedV1Price({ ctx, planId: pro.id });

		// C4
		await autumnV2_3.catalogV2.update({
			plans: [{ plan_id: pro.id, items: [allocatedUsersItem()] }],
		});
		await expectAllocatedV2Price({ ctx, planId: pro.id });

		// C1 (arrear side): the field is gone from GET once migrated.
		const catalog = await autumnV2_3.catalogV2.get();
		const plan = catalog.plans.find((row) => row.id === pro.id);
		if (!plan) throw new Error("plan missing from catalog");
		expect(usersItemOf(plan).price?.allocated_billing).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 allocated_billing: a new allocated usage_based item defaults to arrear")}`,
	async () => {
		const planId = "cv2_alloc_new_default";
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "cv2-alloc-new-default",
			setup: [],
			actions: [],
		});

		// C5
		await autumnV2_3.catalogV2.update({
			plans: [{ plan_id: planId, name: "Pro", items: [allocatedUsersItem()] }],
		});
		await expectAllocatedV2Price({ ctx, planId });

		const catalog = await autumnV2_3.catalogV2.get();
		const plan = catalog.plans.find((row) => row.id === planId);
		if (!plan) throw new Error("plan missing from catalog");
		expect(usersItemOf(plan).price?.allocated_billing).toBeUndefined();
	},
);
