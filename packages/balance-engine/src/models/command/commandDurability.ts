import { z } from "zod/v4";

/** "log" answers once Kafka holds the outcome; "store" keeps the caller waiting until Postgres holds it too. */
export const commandDurabilitySchema = z.enum(["log", "store"]);
export type CommandDurability = z.infer<typeof commandDurabilitySchema>;
