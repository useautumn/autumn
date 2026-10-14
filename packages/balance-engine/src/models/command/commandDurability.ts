import type { z } from "zod/v4";
import { openEnum } from "../common/openSchema.js";

export const commandDurabilitySchema = openEnum({
	name: "commandDurability",
	values: ["log", "store"],
});
export type CommandDurability = z.infer<typeof commandDurabilitySchema>;
