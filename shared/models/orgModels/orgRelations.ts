import { relations } from "drizzle-orm";
import { member, user } from "../../db/auth-schema.js";
import { apiKeys } from "../devModels/apiKeyTable.js";
import { features } from "../featureModels/featureTable.js";
import { organizations } from "./orgTable.js";

export const organizationsRelations = relations(organizations, ({ many }) => ({
	api_keys: many(apiKeys),
	features: many(features),
	members: many(member),
}));
