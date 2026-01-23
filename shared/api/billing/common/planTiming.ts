import { z } from "zod/v4";

export const PlanTimingSchema = z.enum(["immediate", "end_of_cycle"]);

export type PlanTiming = z.infer<typeof PlanTimingSchema>;
