import { expect, test } from "bun:test";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectPerCustomerLaneWithRejections,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

test.concurrent(
	`${chalk.yellowBright("batch version repoint licenses fallback: a changed link field routes the whole migration")}`,
	async () => {
		const stem = uniqueStem("bvr-license-link-fields");
		const customerId = `${stem}-customer`;
		const parent = products.base({
			id: `${stem}-parent`,
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: `${stem}-seat`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
			group: `${stem}-seat-group`,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const before = await getLicenseDbState({
			db: scenario.ctx.db,
			customerId,
		});
		expect(before.pools).toHaveLength(1);

		// Same license product version, same items — only the link's `included`
		// changes, which linkFieldsMatch cannot prove uniform.
		await scenario.autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			items: [itemsV2.dashboard()],
			licenses: [{ license_plan_id: seat.id, included: 2 }],
			force_version: true,
		});

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: {
				customer: {
					plan: { plan_id: parent.id, version: 1, custom: false },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: parent.id, version: 1, custom: false },
						version: 2,
					},
				],
			},
		});

		expectPerCustomerLaneWithRejections({
			result,
			codes: ["license_link_transition"],
		});
		expect(
			result?.rejections?.map((rejection) => String(rejection.code)),
		).toEqual(["license_link_transition"]);

		// The per-customer lane still lands the version: the parent row moves to
		// v2 and the pool follows the target version's plan_license link.
		const afterParent = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId,
			planId: parent.id,
		});
		expect(afterParent.version).toBe(2);

		const target = await getFullLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: parent.id,
			parentVersion: 2,
			licensePlanId: seat.id,
		});
		// The per-customer lane expires the v1 parent and inserts a v2 one, so the
		// live pool is the one hanging off the surviving parent row.
		const after = await getLicenseDbState({ db: scenario.ctx.db, customerId });
		const livePools = after.pools.filter(
			(pool) => pool.parent_customer_product_id === afterParent.id,
		);
		expect(livePools).toHaveLength(1);
		expect(livePools[0]!.plan_license_id).toBe(target.planLicense.id);
		expect(livePools[0]!.link_id).toBe(before.pools[0]!.link_id);
	},
);
