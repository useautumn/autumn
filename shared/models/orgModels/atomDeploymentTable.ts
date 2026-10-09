import {
	bigint,
	integer,
	jsonb,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import type { AppEnv } from "../genModels/genEnums.js";
import type {
	ByocCacheNetwork,
	ByocCacheStages,
	ByocCacheStatus,
} from "./byocConfig.js";
import { organizations } from "./orgTable.js";

/** One env's Atom in the org's own cloud, as alien knows it. */
export const atomDeployments = pgTable(
	"atom_deployments",
	{
		id: text("id").primaryKey(),
		org_id: text("org_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		env: text("env").$type<AppEnv>().notNull(),
		deployment_group_id: text("deployment_group_id").notNull(),
		/** Null until the org runs the setup and alien creates the deployment. */
		deployment_id: text("deployment_id"),
		status: text("status").$type<ByocCacheStatus>().notNull(),
		/** Where the Atom answers; null until its deployment reports one. */
		endpoint_url: text("endpoint_url"),
		/** vCPUs and GiB: the machine its setup asked for, then the one its deployment reports. */
		cpu: integer("cpu"),
		memory: integer("memory"),
		encrypted_token: text("encrypted_token").notNull(),
		/** The token's SHA-256, which the Atom holds and calls Autumn with; null only on a backfilled row until its first refresh. */
		token_hash: text("token_hash"),
		region: text("region"),
		network: jsonb("network").$type<ByocCacheNetwork>(),
		stages: jsonb("stages").$type<ByocCacheStages>().notNull(),
		/** Why the deploy or teardown stopped, in alien's words. */
		error: text("error"),
		created_at: bigint("created_at", { mode: "number" }).notNull(),
	},
	(table) => [
		unique("atom_deployments_deployment_group_id_key").on(
			table.deployment_group_id,
		),
		unique("atom_deployments_org_id_env_key").on(table.org_id, table.env),
		unique("atom_deployments_token_hash_key").on(table.token_hash),
	],
);

export type ByocCacheDeployment = typeof atomDeployments.$inferSelect;

/** All herald needs to route to an Atom, so the cached org holds only these. */
export const atomRouteColumns = {
	status: true,
	deployment_id: true,
	endpoint_url: true,
	encrypted_token: true,
} as const;

export type AtomRoute = Pick<
	ByocCacheDeployment,
	keyof typeof atomRouteColumns
>;
