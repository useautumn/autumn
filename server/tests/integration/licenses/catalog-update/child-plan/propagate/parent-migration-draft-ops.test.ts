/**
 * TDD test for wiring license parents into the migration draft.
 *
 * A child-plan edit that propagates to parent plans must produce ONE draft with
 * TWO ops: the child's own item diff, and a single upsert_licenses op covering
 * every parent. Today `update_license_parents` reaches updateProduct but never
 * createPlanMigrationDraft, so the parents' customers are stranded.
 *
 * Contract under test:
 *   New behaviors:
 *     - edit child + update_license_parents + migration:{draft:true}
 *         -> a draft carrying a parent op
 *     - the op targets plan_filter.plan_id === { $in: [parentA, parentB] } with
 *       customize = { upsert_licenses: [{ license_plan_id: child, customize }] }
 *     - N parents sharing one license update collapse into ONE op, not N
 *     - the parent op carries no add_items/remove_items/price of its own
 *     - the upsert customize is the delta from the customers' CURRENT
 *       definition, not from the edited catalog plan (which diffs to nothing
 *       for an uncustomized link, yielding a no-op migration)
 *     - no child op here: the child has no customers of its own
 *   Side effects:
 *     - one row in `migrations`; response.migration.id defined
 *
 * Pre-impl red: response.migration.id is undefined — no draft at all.
 * Post-impl green: the parent op exists, collapsed via $in, carrying a
 * non-empty upsert customize.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

test(`${chalk.yellowBright("plans.update: child edit drafts one migration with a child op and a collapsed parent op")}`, async () => {
	const proCustomerId = "lic-parent-ops-pro-customer";
	const scaleCustomerId = "lic-parent-ops-scale-customer";

	// Free seat plan: price is outside this contract, and keeping it out avoids
	// the child edit having to restate it.
	const devSeat = products.base({
		id: "dev-seat",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		group: "lic-parent-ops-seat-licenses",
	});
	const pro = products.base({ id: "pro", items: [items.dashboard()] });
	const scale = products.base({
		id: "scale",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});

	const { autumnV2_3, ctx } = await initScenario({
		customerId: proCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([{ id: scaleCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, scale, devSeat], prefix: "lic-parent-ops" }),
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
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
			s.billing.attach({
				customerId: scaleCustomerId,
				productId: scale.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 3 }],
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

	// ── Side effect: a draft exists ────────────────────────────────────
	expect(response.migration?.id).toBeDefined();

	const [migration] = await migrationRepo.get({
		ctx,
		id: response.migration.id,
	});
	const customerOps = migration?.operations?.customer ?? [];

	// ── Behavior: one op, since the child itself has no customers ──────
	// The child is only ever held via parent seat assignments here, so there is
	// no child population to migrate — just the collapsed parent op.
	expect(customerOps).toHaveLength(1);

	const planIdsOf = (filter: unknown): string[] => {
		const matcher = (filter as { plan_id?: unknown })?.plan_id;
		if (typeof matcher === "string") return [matcher];
		const inList = (matcher as { $in?: string[] })?.$in;
		return inList ?? [];
	};

	const parentOp = customerOps.find(
		(op) =>
			op.type === "update_plan" && planIdsOf(op.plan_filter).includes(pro.id),
	);
	expect(parentOp).toBeDefined();
	if (parentOp?.type !== "update_plan") {
		throw new Error("expected an update_plan op");
	}

	// ── Both parents collapse into ONE op via $in ──────────────────────
	expect(planIdsOf(parentOp.plan_filter).sort()).toEqual(
		[pro.id, scale.id].sort(),
	);

	// ── The change rides on upsert_licenses only ───────────────────────
	const upserts = parentOp.customize?.upsert_licenses ?? [];
	expect(upserts).toHaveLength(1);
	expect(upserts[0]).toMatchObject({ license_plan_id: devSeat.id });
	expect(JSON.stringify(upserts[0]?.customize ?? {})).toContain(
		TestFeature.Messages,
	);

	// The parent's own plan items are untouched — applying the child's diff
	// to the parent would edit the wrong plan.
	expect(parentOp.customize?.add_items).toBeUndefined();
	expect(parentOp.customize?.remove_items).toBeUndefined();
	expect(parentOp.customize?.price).toBeUndefined();
});
