import { z } from "zod/v4";

export const VercelResourceCreatedEventSchema = z.object({
	installation_id: z.string(),
	access_token: z.string(),
	resource: z.object({
		id: z.string(),
		name: z.string(),
	}),
});

export type VercelResourceCreatedEvent = z.infer<
	typeof VercelResourceCreatedEventSchema
>;

export const VercelResourceDeletedEventSchema = z.object({
	resource: z.object({
		id: z.string(),
	}),
	installation_id: z.string(),
});

export type VercelResourceDeletedEvent = z.infer<
	typeof VercelResourceDeletedEventSchema
>;

export enum VercelWebhooks {
	ResourceProvisioned = "vercel.resources.provisioned",
	ResourceDeleted = "vercel.resources.deleted",
}
