import { z } from "zod";

export const AutumnMetadataSchema = z.object({
  id: z.string(),
  created_at: z.number(),
  expires_at: z.number(),
  data: z.any(),
});

export type AutumnMetadata = z.infer<typeof AutumnMetadataSchema>;
