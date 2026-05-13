import { relations } from "drizzle-orm";
import { member } from "../../db/auth-schema.js";
import { apiKeys } from "../devModels/apiKeyTable.js";
import { features } from "../featureModels/featureTable.js";
import { migrationRuns } from "../migrationV2Models/migrationRunTable.js";
import { organizations } from "./orgTable.js";

export const organizationsRelations = relations(
	organizations,
	({ many, one }) => ({
		api_keys: many(apiKeys),
		features: many(features),
		members: many(member),
		migration_runs: many(migrationRuns),
		master: one(organizations, {
			fields: [organizations.created_by],
			references: [organizations.id],
		}),
	}),
);
