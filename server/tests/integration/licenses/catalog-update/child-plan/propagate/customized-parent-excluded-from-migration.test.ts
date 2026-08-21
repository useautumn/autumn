/**
 * Contract: a parent whose license link overrides the edited feature is left
 * out of the migration entirely.
 *
 * The override pins its own value, so the child's edit never reaches it — the
 * rebase re-applies the override onto the edited child and the delta comes out
 * empty. This mirrors the catalog write path, which skips customized links
 * (rebaseCatalogPlanLicenses.ts:50), so preview, draft and write agree.
 *
 * The plain parents still collapse into one `$in` op. Emitting an op for the
 * customized parent would be worse than useless: an upsert_licenses entry with
 * no add_items resets the link to catalog inheritance, silently discarding the
 * override.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

const ENT_SEAT_MESSAGES = 900;

const planIdsOf = (filter: unknown): string[] => {
	const matcher = (filter as { plan_id?: unknown })?.plan_id;
	if (typeof matcher === "string") return [matcher];
	return (matcher as { $in?: string[] })?.$in ?? [];
};

test(`${chalk.yellowBright("plans.update: a customized parent link gets its own op instead of collapsing")}`, async () => {
	const proCustomerId = "cust-split-pro-customer";
	const scaleCustomerId = "cust-split-scale-customer";
	const entCustomerId = "cust-split-ent-customer";
	const idPrefix = "cust-split";

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
	const ent = products.base({ id: "ent", items: [items.dashboard()] });

	const { autumnV2_3, ctx } = await initScenario({
		customerId: proCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([
				{ id: scaleCustomerId, paymentMethod: "success" },
				{ id: entCustomerId, paymentMethod: "success" },
			]),
			s.products({ list: [pro, scale, ent, devSeat], prefix: idPrefix }),
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
			s.licenses.link({
				parentProductId: ent.id,
				licenseProductId: devSeat.id,
				included: 3,
				customize: {
					remove_items: [{ feature_id: TestFeature.Messages }],
					add_items: [itemsV2.monthlyMessages({ included: ENT_SEAT_MESSAGES })],
				},
			}),
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
			s.billing.attach({
				customerId: scaleCustomerId,
				productId: scale.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
			s.billing.attach({
				customerId: entCustomerId,
				productId: ent.id,
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
			{ plan_id: ent.id, version: 1 },
		],
		migration: { draft: true },
	});

	expect(response.migration?.id).toBeDefined();
	const [migration] = await migrationRepo.get({
		ctx,
		id: response.migration.id,
	});
	const customerOps = migration?.operations?.customer ?? [];

	// Only the plain parents are migrated; the override has nothing to apply.
	expect(customerOps).toHaveLength(1);

	const plainOp = customerOps[0];
	if (plainOp?.type !== "update_plan") {
		throw new Error("expected an update_plan op");
	}

	expect(planIdsOf(plainOp.plan_filter).sort()).toEqual(
		[pro.id, scale.id].sort(),
	);

	// The customized parent is absent — not swept in, and not reset.
	expect(planIdsOf(plainOp.plan_filter)).not.toContain(ent.id);

	// The plain parents move to the child's new allowance.
	expect(
		plainOp.customize?.upsert_licenses?.[0]?.customize?.add_items,
	).toContainEqual(
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			included: 1000,
		}),
	);
});
