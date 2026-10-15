import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import type { AppEnv } from "../genModels/genEnums.js";
import { organizations } from "../orgModels/orgTable.js";
import type {
	ApprovalRuleSnapshot,
	ApprovalSubjectType,
} from "./approvalModels.js";

export const approvalRules = pgTable(
	"approval_rules",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").$type<AppEnv>().notNull(),
		name: text("name").notNull(),
		actions: text("actions").array().notNull(),
		// Validated by the approvals rule schema before it reaches the repo.
		when: jsonb("when").$type<unknown>(),
		note: text("note"),
		enabled: boolean("enabled").notNull().default(true),
		version: integer("version").notNull().default(1),
		created_by: text("created_by").notNull(),
		updated_by: text("updated_by").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "approval_rules_org_id_fkey",
		}).onDelete("cascade"),
		// Sandbox is unrestricted, so a sandbox rule could never apply.
		check("approval_rules_live_only", sql`${table.env} = 'live'`),
		index("idx_approval_rules_org_env")
			.on(table.org_id, table.env)
			.concurrently(),
	],
);

export const approvalRuleSubjects = pgTable(
	"approval_rule_subjects",
	{
		rule_id: text("rule_id").notNull(),
		org_id: text("org_id").notNull(),
		subject_type: text("subject_type").$type<ApprovalSubjectType>().notNull(),
		subject_id: text("subject_id").notNull(),
	},
	(table) => [
		primaryKey({
			name: "approval_rule_subjects_pkey",
			columns: [table.rule_id, table.subject_type, table.subject_id],
		}),
		foreignKey({
			columns: [table.rule_id],
			foreignColumns: [approvalRules.id],
			name: "approval_rule_subjects_rule_id_fkey",
		}).onDelete("cascade"),
		index("idx_approval_rule_subjects_lookup")
			.on(table.org_id, table.subject_type, table.subject_id)
			.concurrently(),
	],
);

export const approvalRuleVersions = pgTable(
	"approval_rule_versions",
	{
		// No FK to approval_rules: history outlives a deleted rule.
		rule_id: text("rule_id").notNull(),
		org_id: text("org_id").notNull(),
		version: integer("version").notNull(),
		snapshot: jsonb("snapshot").$type<ApprovalRuleSnapshot>().notNull(),
		created_by: text("created_by").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		primaryKey({
			name: "approval_rule_versions_pkey",
			columns: [table.rule_id, table.version],
		}),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "approval_rule_versions_org_id_fkey",
		}).onDelete("cascade"),
	],
);
