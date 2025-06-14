import { relations } from "drizzle-orm";
import { user } from "./auth-schema.js";
import { organizations } from "../models/orgModels/orgTable.js";

export const userRelations = relations(user, ({ many }) => ({}));
