import { relations } from "drizzle-orm";
import { migrationErrors } from "./migrationErrorTable.js";
import { customers } from "../cusModels/cusTable.js";

export const migrationErrorRelations = relations(
	migrationErrors,
	({ one }) => ({
		customer: one(customers, {
			fields: [migrationErrors.internal_customer_id],
			references: [customers.internal_id],
		}),
	}),
);
