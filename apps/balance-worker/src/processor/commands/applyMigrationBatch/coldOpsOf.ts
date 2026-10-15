import type {
	ApplyBillingPlanCommand,
	BillingPlanOp,
} from "@autumn/balance-engine";
import type { ColdMigrationOp } from "@autumn/postgres";

const EXPECTED_GRANT_COLUMNS = new Set(["entitlement_id"]);
const EXPECTED_PRODUCT_COLUMNS = new Set([
	"internal_product_id",
	"status",
	"is_custom",
]);
const SETTABLE_GRANT_COLUMNS = new Set([
	"entitlement_id",
	"internal_feature_id",
	"feature_id",
	"reset_cycle_anchor",
	"next_reset_at",
	"unlimited",
	"balance",
]);

const keysWithin = ({
	value,
	allowed,
}: {
	value: object | undefined;
	allowed: Set<string>;
}): boolean => Object.keys(value ?? {}).every((key) => allowed.has(key));

const coldOpOf = ({ op }: { op: BillingPlanOp }): ColdMigrationOp | null => {
	if (op.table !== "customerEntitlements") return null;
	if (op.op === "delete") {
		if (!keysWithin({ value: op.expect, allowed: EXPECTED_GRANT_COLUMNS }))
			return null;
		if (
			!keysWithin({
				value: op.expectProduct?.columns,
				allowed: EXPECTED_PRODUCT_COLUMNS,
			})
		)
			return null;
		return {
			kind: "delete",
			customerEntitlementId: op.id,
			expect: op.expect,
			expectProduct: op.expectProduct,
			withoutRollovers: op.withoutRollovers ?? false,
		};
	}
	if (op.op === "update") {
		if (!keysWithin({ value: op.set, allowed: SETTABLE_GRANT_COLUMNS }))
			return null;
		if (!keysWithin({ value: op.expect, allowed: EXPECTED_GRANT_COLUMNS }))
			return null;
		if (
			!keysWithin({
				value: op.expectProduct?.columns,
				allowed: EXPECTED_PRODUCT_COLUMNS,
			})
		)
			return null;
		return {
			kind: "update",
			customerEntitlementId: op.id,
			expect: op.expect,
			expectProduct: op.expectProduct,
			set: op.set,
		};
	}
	if (op.op === "increment") {
		if (op.addEntries !== undefined) return null;
		const add = op.add as Record<string, unknown>;
		const keys = Object.keys(add);
		if (keys.some((key) => key !== "balance")) return null;
		if (typeof add.balance !== "number") return null;
		return {
			kind: "increment",
			customerEntitlementId: op.id,
			addBalance: add.balance,
		};
	}
	return null;
};

/** One grant's ops compose the same way in SQL as in the engine: a lone delete, or at most one update and then increments. */
const composesLikeTheEngine = ({
	ops,
}: {
	ops: readonly ColdMigrationOp[];
}): boolean => {
	const byGrant = new Map<string, ColdMigrationOp[]>();
	for (const op of ops) {
		const grantOps = byGrant.get(op.customerEntitlementId) ?? [];
		grantOps.push(op);
		byGrant.set(op.customerEntitlementId, grantOps);
	}
	for (const grantOps of byGrant.values()) {
		const kinds = grantOps.map(({ kind }) => kind);
		if (kinds.includes("delete") && kinds.length > 1) return false;
		if (kinds.filter((kind) => kind === "update").length > 1) return false;
		if (kinds.indexOf("update") > 0) return false;
	}
	return true;
};

/** The plan as guarded SQL, or null when an op has no cold form and the customer takes the in-memory path. */
export const coldOpsOf = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): ColdMigrationOp[] | null => {
	if (command.ops.length === 0) return null;
	const ops: ColdMigrationOp[] = [];
	for (const op of command.ops) {
		const cold = coldOpOf({ op });
		if (!cold) return null;
		ops.push(cold);
	}
	return composesLikeTheEngine({ ops }) ? ops : null;
};
