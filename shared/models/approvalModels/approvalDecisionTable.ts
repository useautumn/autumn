import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { organizations } from "../orgModels/orgTable.js";
import type {
	ApprovalDecidedBy,
	ApprovalDecisionVerdict,
	ApprovalViolationRow,
} from "./approvalModels.js";

/** Audit and shadow log: one row per rules evaluation on a write. Live-only, so no env. */
export const approvalDecisions = pgTable(
	"approval_decisions",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		request_id: text("request_id"),
		action: text("action").notNull(),
		user_id: text("user_id"),
		role: text("role"),
		verdict: text("verdict").$type<ApprovalDecisionVerdict>().notNull(),
		// False in shadow mode, where a deny is logged but not blocked.
		enforced: boolean("enforced").notNull(),
		decided_by: jsonb("decided_by").$type<ApprovalDecidedBy | null>(),
		rule_version: integer("rule_version"),
		violations: jsonb("violations")
			.$type<ApprovalViolationRow[]>()
			.notNull()
			.default([]),
		facts: jsonb("facts").$type<unknown>().notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "approval_decisions_org_id_fkey",
		}).onDelete("cascade"),
		index("idx_approval_decisions_org_created")
			.on(table.org_id, table.created_at)
			.concurrently(),
	],
);
