import { sql } from "drizzle-orm";
import {
	bigint,
	integer,
	jsonb,
	pgTable,
	text,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AppEnv } from "../genModels/genEnums.js";
import type {
	ByocCacheNetwork,
	ByocCacheStages,
	ByocCacheStatus,
} from "./byocConfig.js";
import { organizations } from "./orgTable.js";

export const atomDeployments = pgTable(
	"atom_deployments",
	{
		id: text("id").primaryKey(),
		org_id: text("org_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		env: text("env").$type<AppEnv>().notNull(),
		deployment_group_id: text("deployment_group_id").notNull(),
		deployment_id: text("deployment_id"),
		status: text("status").$type<ByocCacheStatus>().notNull(),
		endpoint_url: text("endpoint_url"),
		cpu: integer("cpu"),
		memory: integer("memory"),
		encrypted_token: text("encrypted_token").notNull(),
		token_hash: text("token_hash"),
		region: text("region"),
		network: jsonb("network").$type<ByocCacheNetwork>(),
		stack_name: text("stack_name"),
		stages: jsonb("stages").$type<ByocCacheStages>().notNull(),
		first_check_at: bigint("first_check_at", { mode: "number" }),
		error: text("error"),
		created_at: bigint("created_at", { mode: "number" }).notNull(),
	},
	(table) => [
		unique("atom_deployments_deployment_group_id_key").on(
			table.deployment_group_id,
		),
		uniqueIndex("atom_deployments_active_org_id_env_key")
			.on(table.org_id, table.env)
			.where(sql`${table.status} NOT IN ('removing', 'teardown_required')`),
		unique("atom_deployments_token_hash_key").on(table.token_hash),
	],
);

export type ByocCacheDeployment = typeof atomDeployments.$inferSelect;

export const atomRouteColumns = {
	id: true,
	status: true,
	deployment_id: true,
	endpoint_url: true,
	encrypted_token: true,
} as const;

export type AtomRoute = Pick<
	ByocCacheDeployment,
	keyof typeof atomRouteColumns
>;
