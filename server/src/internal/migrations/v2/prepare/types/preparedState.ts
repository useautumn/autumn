import { z } from "zod/v4";

export const PreparedStateSchema = z.record(z.string(), z.unknown());

export type PreparedState = z.infer<typeof PreparedStateSchema>;
