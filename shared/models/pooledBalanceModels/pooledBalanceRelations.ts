import { relations } from "drizzle-orm";
import { customerEntitlements } from "../cusProductModels/cusEntModels/cusEntTable.js";
import {
	pooledBalanceContributions,
	pooledBalances,
} from "./pooledBalanceTable.js";

export const pooledBalancesRelations = relations(pooledBalances, ({ one }) => ({
	customer_entitlement: one(customerEntitlements, {
		fields: [pooledBalances.customer_entitlement_id],
		references: [customerEntitlements.id],
	}),
}));

export const pooledBalanceContributionsRelations = relations(
	pooledBalanceContributions,
	({ one }) => ({
		pooled_balance: one(pooledBalances, {
			fields: [pooledBalanceContributions.pooled_balance_id],
			references: [pooledBalances.id],
		}),
		source_customer_entitlement: one(customerEntitlements, {
			fields: [pooledBalanceContributions.source_customer_entitlement_id],
			references: [customerEntitlements.id],
			relationName: "sourceCustomerEntitlementContribution",
		}),
	}),
);
