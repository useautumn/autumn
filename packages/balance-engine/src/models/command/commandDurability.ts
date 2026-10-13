import type { z } from "zod/v4";
import { openEnum } from "../common/openSchema.js";

/** "log" answers once Kafka holds the outcome; "store" keeps the caller waiting until Postgres holds it too. */
export const commandDurabilitySchema = openEnum({
	name: "commandDurability",
	values: ["log", "store"],
});
export type CommandDurability = z.infer<typeof commandDurabilitySchema>;
