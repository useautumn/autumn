/**
 * Contract: a parent with no customers contributes no migration target, and a
 * single op patches each matched customer exactly once.
 *
 * Both parents offer the same license, but only one has customers. Emitting a
 * target for the empty parent would widen the filter for no reason; emitting
 * two ops for one license would let the second write clobber the first for any
 * customer reachable through both.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

const planIdsOf = (filter: unknown): string[] => {
	const matcher = (filter as { plan_id?: unknown })?.plan_id;
	if (typeof matcher === "string") return [matcher];
	return (matcher as { $in?: string[] })?.$in ?? [];
};

test(`${chalk.yellowBright("plans.update: a parent with no customers contributes no migration target")}`, async () => {
	const customerId = "shared-cus-both-parents";
	const idPrefix = "shared-cus";

	const devSeat = products.base({
		id: "dev-seat",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		group: `${idPrefix}-seat-licenses`,
	});
	const pro = products.base({ id: "pro", items: [items.dashboard()] });
	const scale = products.base({
		id: "scale",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});

	// One customer, BOTH parent plans, each carrying the same seat license.
	const { autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro, scale, devSeat], prefix: idPrefix }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: devSeat.id,
				included: 1,
			}),
			s.licenses.link({
				parentProductId: scale.id,
				licenseProductId: devSeat.id,
				included: 2,
			}),
			// Only `pro` is attached. Attaching BOTH parents to one customer
			// currently 500s with a license_entitlements FK violation — a
			// pre-existing bug in the attach path, unrelated to migrations.
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
		],
	});

	const response = await autumnV2_3.post("/plans.update", {
		plan_id: devSeat.id,
		items: [itemsV2.monthlyMessages({ included: 1000 })],
		disable_version: true,
		update_license_parents: [
			{ plan_id: pro.id, version: 1 },
			{ plan_id: scale.id, version: 1 },
		],
		migration: { draft: true },
	});

	expect(response.migration?.id).toBeDefined();
	const [migration] = await migrationRepo.get({
		ctx,
		id: response.migration.id,
	});
	const customerOps = migration?.operations?.customer ?? [];

	// A single op, so any customer matched through it is patched exactly once.
	// `scale` is absent: it has no customers, and a parent with nobody to
	// migrate must not contribute a target.
	expect(customerOps).toHaveLength(1);

	const op = customerOps[0];
	if (op?.type !== "update_plan") throw new Error("expected update_plan");
	expect(planIdsOf(op.plan_filter)).toEqual([pro.id]);
	expect(planIdsOf(op.plan_filter)).not.toContain(scale.id);

	// One upsert entry for the license, not one per parent.
	const upserts = op.customize?.upsert_licenses ?? [];
	expect(upserts).toHaveLength(1);
	expect(upserts[0]).toMatchObject({ license_plan_id: devSeat.id });
	expect(upserts[0]?.customize?.add_items).toContainEqual(
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			included: 1000,
		}),
	);
});
