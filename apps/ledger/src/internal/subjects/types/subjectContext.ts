import type { PostgresDb } from "@autumn/postgres";
import type { ShardContext } from "../../shard/types/shardContext.js";

// Subject work reads Postgres and writes the shard's sqlite, so it needs both.
export type SubjectContext = ShardContext & { postgres: PostgresDb };
