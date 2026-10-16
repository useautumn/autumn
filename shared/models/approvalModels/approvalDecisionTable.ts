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
import type { AppEnv } from "../genModels/genEnums.js";
import { organizations } from "../orgModels/orgTable.js";
import type { ApprovalDecisionVerdict } from "./approvalModels.js";

/** Audit and shadow log: one row per rules evaluation on a write. */
export const approvalDecisions = pgTable(
	"approval_decisions",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").$type<AppEnv>().notNull(),
		request_id: text("request_id"),
		action: text("action").notNull(),
		user_id: text("user_id"),
		role: text("role"),
		verdict: text("verdict").$type<ApprovalDecisionVerdict>().notNull(),
		// False in shadow mode, where a deny is logged but not blocked.
		enforced: boolean("enforced").notNull(),
		decided_by: jsonb("decided_by").$type<unknown>(),
		rule_version: integer("rule_version"),
		violations: jsonb("violations").$type<unknown[]>().notNull().default([]),
		facts: jsonb("facts").$type<unknown>().notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "approval_decisions_org_id_fkey",
		}).onDelete("cascade"),
		index("idx_approval_decisions_org_env_created")
			.on(table.org_id, table.env, table.created_at)
			.concurrently(),
	],
);
