/**
 * Contract: the child plan and its parents get SEPARATE migrations.
 *
 * They move different customer populations by different operations — the child
 * by its own item diff, parents by a license customize — so each is drafted,
 * run and cancelled on its own rather than sharing one row.
 *
 * The response carries `migrations` for every draft, and keeps `migration`
 * pointing at the first so single-draft consumers are unaffected.
 */
import { expect, test } from "bun:test";
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

test(`${chalk.yellowBright("plans.update: child and parent are drafted as separate migrations")}`, async () => {
	const idPrefix = "split-mig";
	const parentCustomerId = `${idPrefix}-parent-cus`;
	const directCustomerId = `${idPrefix}-direct-cus`;

	const devSeat = products.base({
		id: "dev-seat",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		group: `${idPrefix}-licenses`,
	});
	const pro = products.base({ id: "pro", items: [items.dashboard()] });

	const { autumnV2_3, ctx } = await initScenario({
		customerId: parentCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([{ id: directCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, devSeat], prefix: idPrefix }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: devSeat.id,
				included: 1,
			}),
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
			// A customer on the child plan directly, so BOTH populations exist.
			s.billing.attach({
				customerId: directCustomerId,
				productId: devSeat.id,
			}),
		],
	});

	const response = await autumnV2_3.post("/plans.update", {
		plan_id: devSeat.id,
		items: [itemsV2.monthlyMessages({ included: 1000 })],
		disable_version: true,
		update_license_parents: [{ plan_id: pro.id, version: 1 }],
		migration: { draft: true },
	});

	// ── Two drafts, and `migration` still points at the first ──────────
	expect(response.migrations).toHaveLength(2);
	expect(response.migration?.id).toBe(response.migrations[0].id);

	const ids: string[] = response.migrations.map(({ id }: { id: string }) => id);
	expect(new Set(ids).size).toBe(2);

	const opsById = new Map<string, unknown[]>();
	for (const id of ids) {
		const [row] = await migrationRepo.get({ ctx, id });
		opsById.set(id, row?.operations?.customer ?? []);
	}

	// ── Each migration carries exactly one op, for one population ──────
	const childOps = [...opsById.values()].find((ops) =>
		ops.some((op) =>
			planIdsOf((op as { plan_filter: unknown }).plan_filter).includes(
				devSeat.id,
			),
		),
	);
	const parentOps = [...opsById.values()].find((ops) =>
		ops.some((op) =>
			planIdsOf((op as { plan_filter: unknown }).plan_filter).includes(pro.id),
		),
	);
	expect(childOps).toHaveLength(1);
	expect(parentOps).toHaveLength(1);

	// The child migration never touches the parent, and vice versa.
	const childOp = childOps?.[0] as { customize?: Record<string, unknown> };
	const parentOp = parentOps?.[0] as { customize?: Record<string, unknown> };
	expect(childOp.customize?.upsert_licenses).toBeUndefined();
	expect(parentOp.customize?.add_items).toBeUndefined();
	expect(parentOp.customize?.upsert_licenses).toBeDefined();
});
