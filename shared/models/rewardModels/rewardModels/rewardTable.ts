import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { foreignKey, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { organizations } from "../../orgModels/orgTable.js";
import type {
  DiscountConfig,
  FreeProductConfig,
  PromoCode,
} from "./rewardModels.js";

export const rewards = pgTable(
	"rewards",
	{
		internal_id: text("internal_id").primaryKey().notNull(),
		id: text(),
		org_id: text("org_id"),
		env: text(),
		created_at: numeric({ mode: "number" }),
		name: text(),
		discount_config: jsonb("discount_config").$type<DiscountConfig>(),
		free_product_config: jsonb(
			"free_product_config",
		).$type<FreeProductConfig>(),
		free_product_id: text("free_product_id"),
		promo_codes: jsonb("promo_codes").$type<PromoCode[]>().array(),
		type: text(),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "coupons_org_id_fkey",
		}).onDelete("cascade"),
	],
);

export type RewardRow = InferSelectModel<typeof rewards>;
export type InsertRewardRow = InferInsertModel<typeof rewards>;
