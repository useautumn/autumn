import { relations } from "drizzle-orm";
import { atomDeployments } from "./atomDeploymentTable.js";
import { organizations } from "./orgTable.js";

export const atomDeploymentsRelations = relations(
	atomDeployments,
	({ one }) => ({
		org: one(organizations, {
			fields: [atomDeployments.org_id],
			references: [organizations.id],
		}),
	}),
);
