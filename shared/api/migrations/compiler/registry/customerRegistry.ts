import { RELEVANT_STATUSES } from "../../../../utils/cusProductUtils/cusProductConstants.js";
import type { NavScope, RootScope } from "./registryTypes.js";

export const PLAN_BASE_PRICE_SQL = [
	"(SELECT base_cpr.id FROM customer_prices base_cpr",
	"JOIN prices base_pr ON base_pr.id = base_cpr.price_id",
	"WHERE base_cpr.customer_product_id = cp.id",
	"AND base_pr.entitlement_id IS NULL LIMIT 1)",
].join(" ");

export const PLAN_PAID_EXISTS_SQL =
	"EXISTS (SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id)";

export const PLAN_RECURRING_EXISTS_SQL = [
	"EXISTS (SELECT 1 FROM customer_prices cpr",
	"JOIN prices pr ON pr.id = cpr.price_id",
	"WHERE cpr.customer_product_id = cp.id",
	"AND pr.config->>'interval' <> 'one_off')",
].join(" ");

const itemScope: NavScope = {
	from: [
		"customer_entitlements ce",
		"JOIN entitlements e ON e.id = ce.entitlement_id",
		"LEFT JOIN prices pr ON pr.entitlement_id = e.id",
		"LEFT JOIN customer_prices cpr ON cpr.price_id = pr.id AND cpr.customer_product_id = ce.customer_product_id",
	].join(" "),
	correlation: "ce.customer_product_id = cp.id",
	fields: {
		feature_id: { kind: "leaf", sql: "e.internal_feature_id" },
		price: { kind: "leaf", sql: "cpr.id" },
		rollover: { kind: "leaf", sql: "e.rollover" },
	},
};

const itemPaidScope: NavScope = {
	from: [
		"customer_prices cpr",
		"JOIN prices pr ON pr.id = cpr.price_id",
		"JOIN entitlements e ON e.id = pr.entitlement_id",
	].join(" "),
	correlation: "cpr.customer_product_id = cp.id",
	fields: {
		feature_id: { kind: "leaf", sql: "e.internal_feature_id" },
		price: { kind: "leaf", sql: "cpr.id" },
		rollover: { kind: "leaf", sql: "e.rollover" },
	},
};

const planScope: NavScope = {
	from: "customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id",
	correlation:
		"cp.internal_customer_id = c.internal_id AND cp.customer_license_link_id IS NULL",
	ambient: [
		{
			column: "cp.status",
			source: { kind: "values", values: RELEVANT_STATUSES },
		},
	],
	fields: {
		plan_id: { kind: "leaf", sql: "p.id" },
		version: { kind: "leaf", sql: "p.version" },
		addon: { kind: "leaf", sql: "p.is_add_on" },
		custom: { kind: "leaf", sql: "cp.is_custom" },
		price: { kind: "leaf", sql: PLAN_BASE_PRICE_SQL },
		paid: { kind: "leaf", sql: PLAN_PAID_EXISTS_SQL },
		recurring: { kind: "leaf", sql: PLAN_RECURRING_EXISTS_SQL },
		item: { kind: "nav", scope: itemScope },
		item_paid: { kind: "nav", scope: itemPaidScope },
	},
};

export const customerRegistry: RootScope = {
	from: "customers c",
	ambient: [
		{ column: "c.org_id", source: { kind: "context", key: "orgId" } },
		{ column: "c.env", source: { kind: "context", key: "env" } },
	],
	fields: {
		customer_id: { kind: "leaf", sql: "c.id" },
		plan: { kind: "nav", scope: planScope },
	},
};
