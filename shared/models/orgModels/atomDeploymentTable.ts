import {
	bigint,
	index,
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

/** One of an env's Atoms in the org's own cloud, as alien knows it. */
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
		/** Each replica's data volume in GiB: the size its setup asked for, then the size its deployment selects. It only grows. */
		volume_size_gib: integer("volume_size_gib").notNull().default(20),
		network: jsonb("network").$type<ByocCacheNetwork>(),
		/** The stack's full name in the org's cloud; null on rows made before it could be chosen. */
		stack_name: text("stack_name"),
		stages: jsonb("stages").$type<ByocCacheStages>().notNull(),
		/** When the org finished setup on its first checks; setup is done from then on. */
		first_check_at: bigint("first_check_at", { mode: "number" }),
		/** When the Atom's health first counted a check from the org's app; written once, and setup can finish from then on. */
		first_check_seen_at: bigint("first_check_seen_at", { mode: "number" }),
		/** Why the deploy or teardown stopped, in alien's words. */
		error: text("error"),
		created_at: bigint("created_at", { mode: "number" }).notNull(),
		/** What the org calls this Atom in its dashboard; null shows its region and stack name. */
		name: text("name"),
	},
	(table) => [
		unique("atom_deployments_deployment_group_id_key").on(
			table.deployment_group_id,
		),
		unique("atom_deployments_token_hash_key").on(table.token_hash),
		index("atom_deployments_org_id_env_idx").on(table.org_id, table.env),
	],
);

export type ByocCacheDeployment = typeof atomDeployments.$inferSelect;

/** All herald needs to route to an Atom, so the cached org holds only these. */
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
