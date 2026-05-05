import { z } from "zod/v4";

export const UnixMsTimestampSchema = z.number().int().safe().nonnegative();
