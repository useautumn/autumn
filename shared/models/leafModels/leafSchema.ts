import { pgSchema } from "drizzle-orm/pg-core";

// All leaf/chat tables live in their own `leaf` Postgres schema to keep the public
// schema tidy. Table-def files use `leafSchema.table(...)` instead of `pgTable(...)`.
export const leafSchema = pgSchema("leaf");
