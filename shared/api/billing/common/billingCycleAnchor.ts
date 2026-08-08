import { z } from "zod/v4";

export const BillingCycleAnchorSchema = z.enum(["now"]);
