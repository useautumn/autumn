import { pgTable, text, numeric, jsonb, boolean } from "drizzle-orm/pg-core";

import { ChatResultFeature } from "../chatResultModels/chatResultFeature.js";
import { ProductV2 } from "../productV2Models/productV2Models.js";
import { collatePgColumn } from "../../db/utils.js";

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
