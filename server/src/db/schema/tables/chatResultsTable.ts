import { pgTable, text, numeric, jsonb, boolean } from "drizzle-orm/pg-core";
import { collatePgColumn } from "../schemaUtils.js";
import { ChatResultFeature, ProductV2 } from "@autumn/shared";

export const chatResults = pgTable("chat_results", {
  id: text("id").primaryKey(),
  created_at: numeric("created_at"),
  data: jsonb("data")
    .$type<{
      features: ChatResultFeature[];
      products: ProductV2[];
    }>()
    .notNull(),
  processed: boolean("processed").default(false),
}).enableRLS();

collatePgColumn(chatResults.id, "C");
