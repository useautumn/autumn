import { z } from "zod/v4";

export const nonEmptyStringSchema = z.string().min(1);
export const timestampSchema = z.number().int().nonnegative();
export const finiteNumberSchema = z.number().finite();
