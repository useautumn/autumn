import { relations } from "drizzle-orm";
import { customers } from "../cusModels/cusTable.js";
import { migrationErrors } from "./migrationErrorTable.js";

export const migrationErrorRelations = relations(
	migrationErrors,
	({ one }) => ({
		customer: one(customers, {
			fields: [migrationErrors.internal_customer_id],
			references: [customers.internal_id],
		}),
	}),
);
