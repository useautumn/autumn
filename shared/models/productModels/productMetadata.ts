import { z } from "zod/v4";

// biome-ignore lint/suspicious/noExplicitAny: metadata values are intentionally arbitrary JSON
export const ProductMetadataSchema = z.record(z.string(), z.any());

// biome-ignore lint/suspicious/noExplicitAny: metadata values are intentionally arbitrary JSON
export type ProductMetadata = Record<string, any>;
