import { boolean, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../db/utils.js";
import type { ChatResultFeature } from "../chatResultModels/chatResultFeature.js";
import type { ProductV2 } from "../productV2Models/productV2Models.js";

export const chatResults = pgTable("chat_results", {
	id: text("id").primaryKey(),
	created_at: numeric("created_at"),
	data: jsonb("data")
		.$type<{
			features: ChatResultFeature[];
			products: ProductV2[];
		}>()
		.notNull(),
}).enableRLS();

collatePgColumn(chatResults.id, "C");
