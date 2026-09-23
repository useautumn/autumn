import { describe, expect, test } from "bun:test";
import type { BillingPlanOp } from "@autumn/balance-engine";
import { CusProductStatus, type FullCustomerEntitlement } from "@autumn/shared";
import { customerEntitlementToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customerEntitlements/customerEntitlementToPlanOps.js";
import {
	grant,
	grantWithRollovers,
	opSummary,
	product,
} from "../../billingPlanFixtures.js";

const carried = [
	{ id: "ro_late", balance: 6, expiresAt: 2_000 },
	{ id: "ro_early", balance: 8, expiresAt: 1_000 },
];

const cappedAt = (max: number | null) =>
	grantWithRollovers({
		id: "grant_capped",
		customerProductId: "cp_live",
		max,
		carried,
	});

const productWith = ({
	status,
	customerEntitlement,
}: {
	status: CusProductStatus;
	customerEntitlement: FullCustomerEntitlement;
}) => product({ id: "cp_live", status, grants: [customerEntitlement] });

const opsFor = ({
	customerEntitlement,
	status = CusProductStatus.Active,
}: {
	customerEntitlement: FullCustomerEntitlement;
	status?: CusProductStatus;
}) =>
	customerEntitlementToPlanOps({
		customerEntitlement,
		customerProduct: productWith({ status, customerEntitlement }),
	});

const insertedRollovers = (ops: BillingPlanOp[]) =>
	ops.flatMap((op) =>
		op.op === "insert" && op.table === "rollovers"
			? [{ id: op.row.id, balance: op.row.balance }]
			: [],
	);

describe("customerEntitlementToPlanOps", () => {
	test("a grant with no rollovers is one insert", () => {
		expect(
			opSummary(opsFor({ customerEntitlement: grant({ id: "grant_plain" }) })),
		).toEqual(["insert:customerEntitlements"]);
	});

	test("carried rollovers are inserted after their grant when the product is Active or PastDue", () => {
		for (const status of [CusProductStatus.Active, CusProductStatus.PastDue]) {
			expect(
				opSummary(opsFor({ customerEntitlement: cappedAt(null), status })),
			).toEqual([
				"insert:customerEntitlements",
				"insert:rollovers",
				"insert:rollovers",
			]);
		}
	});

	test("a product not live yet, or no longer, carries no rollovers", () => {
		for (const status of [
			CusProductStatus.Scheduled,
			CusProductStatus.Expired,
		]) {
			expect(
				opSummary(opsFor({ customerEntitlement: cappedAt(null), status })),
			).toEqual(["insert:customerEntitlements"]);
		}
		expect(
			opSummary(
				customerEntitlementToPlanOps({ customerEntitlement: cappedAt(null) }),
			),
		).toEqual(["insert:customerEntitlements"]);
	});

	test("a grant with no rollover config keeps every carried rollover whole", () => {
		const customerEntitlement = {
			...cappedAt(1),
			entitlement: { ...cappedAt(1).entitlement, rollover: null },
		};
		expect(insertedRollovers(opsFor({ customerEntitlement }))).toEqual([
			{ id: "ro_late", balance: 6 },
			{ id: "ro_early", balance: 8 },
		]);
	});

	test("an unlimited cap, or a total under it, keeps every carried rollover whole", () => {
		for (const max of [null, 14, 100]) {
			expect(
				insertedRollovers(opsFor({ customerEntitlement: cappedAt(max) })),
			).toEqual([
				{ id: "ro_late", balance: 6 },
				{ id: "ro_early", balance: 8 },
			]);
		}
	});

	test("over the cap, the earliest-expiring rollover is trimmed first", () => {
		expect(
			insertedRollovers(opsFor({ customerEntitlement: cappedAt(10) })),
		).toEqual([
			{ id: "ro_late", balance: 6 },
			{ id: "ro_early", balance: 4 },
		]);
	});

	test("a rollover drained to zero is dropped, and the trim moves on to the next", () => {
		expect(
			insertedRollovers(opsFor({ customerEntitlement: cappedAt(6) })),
		).toEqual([{ id: "ro_late", balance: 6 }]);
		expect(
			insertedRollovers(opsFor({ customerEntitlement: cappedAt(3) })),
		).toEqual([{ id: "ro_late", balance: 3 }]);
	});

	test("a cap of zero drops every carried rollover", () => {
		expect(opSummary(opsFor({ customerEntitlement: cappedAt(0) }))).toEqual([
			"insert:customerEntitlements",
		]);
	});

	test("capping leaves the plan's own rollovers as they were", () => {
		const customerEntitlement = cappedAt(10);
		opsFor({ customerEntitlement });
		expect(
			customerEntitlement.rollovers.map(({ id, balance }) => ({ id, balance })),
		).toEqual([
			{ id: "ro_late", balance: 6 },
			{ id: "ro_early", balance: 8 },
		]);
	});

	test("rows are cut to stored columns: no joined entitlement, rollovers, replaceables or product", () => {
		const ops = opsFor({ customerEntitlement: cappedAt(null) });
		const [grantOp, rolloverOp] = ops;
		if (grantOp?.op !== "insert" || rolloverOp?.op !== "insert")
			throw new Error("expected inserts");
		expect(grantOp.row).toMatchObject({
			id: "grant_capped",
			customer_product_id: "cp_live",
			balance: 100,
		});
		for (const joined of [
			"entitlement",
			"rollovers",
			"replaceables",
			"customer_product",
			"cache_version",
		])
			expect(grantOp.row).not.toHaveProperty(joined);
		expect(rolloverOp.row).toEqual({
			id: "ro_late",
			cus_ent_id: "grant_capped",
			balance: 6,
			usage: 0,
			expires_at: 2_000,
			entities: {},
		});
	});
});
