import { relations } from "drizzle-orm";
import { organizations } from "../orgModels/orgTable.js";
import { migrationRuns } from "./migrationRunTable.js";
import { migrations } from "./migrationTable.js";

export const migrationRunsRelations = relations(migrationRuns, ({ one }) => ({
	migration: one(migrations, {
		fields: [migrationRuns.migration_internal_id],
		references: [migrations.internal_id],
	}),
	organization: one(organizations, {
		fields: [migrationRuns.org_id],
		references: [organizations.id],
	}),
}));
