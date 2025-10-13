import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	jsonb,
	numeric,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../db/utils.js";
import { organizations } from "../orgModels/orgTable.js";
import type { CreditSystemConfig } from "./featureConfig/creditConfig.js";
import type { MeteredConfig } from "./featureConfig/meteredConfig.js";

type FeatureDisplay = {
	singular: string;
	plural: string;
};

export const features = pgTable(
	"features",
	{
		internal_id: text("internal_id").primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		created_at: numeric({ mode: "number" }),
		env: text(),

		id: text().notNull(),
		name: text(),
		type: text().notNull(),
		config: jsonb().$type<MeteredConfig | CreditSystemConfig>(),
		display: jsonb().default(sql`null`).$type<FeatureDisplay>(),
		archived: boolean("archived").notNull().default(false),
		event_names: text("event_names").array().default([]),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "features_org_id_fkey",
		}).onDelete("cascade"),
		unique("feature_id_constraint").on(table.org_id, table.id, table.env),
	],
);

collatePgColumn(features.internal_id, "C");
