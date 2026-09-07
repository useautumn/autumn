import { z } from "zod/v4";
import {
	SandboxColorSchema,
	SandboxIconSchema,
} from "../../models/orgModels/sandboxDisplay";

/**
 * Sandbox request/response models. Shared between the server handlers (request
 * validation) and the OpenAPI contract (SDK + docs).
 */

export const CreateSandboxParamsSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.describe("A name for the sandbox, unique within your organization."),
	color: SandboxColorSchema.optional().describe(
		"Colour the dashboard uses to label the sandbox. Defaults to `gray`.",
	),
	icon: SandboxIconSchema.optional().describe(
		"Icon the dashboard uses to label the sandbox. Defaults to `Flask`.",
	),
});

export const SandboxSchema = z.object({
	id: z.string().describe("The sandbox's organization ID."),
	name: z.string().describe("The sandbox's name."),
	slug: z.string().describe("The sandbox's slug, derived from its name."),
	created_at: z
		.number()
		.describe("When the sandbox was created, ms since epoch."),
	color: SandboxColorSchema.describe(
		"Colour the dashboard uses to label the sandbox.",
	),
	icon: SandboxIconSchema.describe(
		"Icon the dashboard uses to label the sandbox.",
	),
});

export const CreateSandboxResponseSchema = SandboxSchema.extend({
	secret_key: z
		.string()
		.describe(
			"The sandbox's own secret key. Shown once, here — store it before you discard the response.",
		),
});

export const ListSandboxesParamsSchema = z
	.object({})
	.describe("No body. Lists every sandbox belonging to your organization.");

export const ListSandboxesResponseSchema = z.object({
	list: z
		.array(SandboxSchema)
		.describe("Your organization's sandboxes, newest first."),
});

export const DeleteSandboxParamsSchema = z.object({
	id: z.string().min(1).describe("The ID of the sandbox to delete."),
});

export const DeleteSandboxResponseSchema = z.object({
	success: z
		.literal(true)
		.describe("Always true when the sandbox was deleted."),
});

export const ResetSandboxParamsSchema = z
	.object({})
	.describe(
		"No body. Resets the sandbox the calling key belongs to — there is no id to pass.",
	);

export const ResetSandboxResponseSchema = z.object({
	success: z.literal(true).describe("Always true when the sandbox was reset."),
});

export type CreateSandboxParams = z.infer<typeof CreateSandboxParamsSchema>;
export type CreateSandboxResponse = z.infer<typeof CreateSandboxResponseSchema>;
export type Sandbox = z.infer<typeof SandboxSchema>;
export type ListSandboxesResponse = z.infer<typeof ListSandboxesResponseSchema>;
export type DeleteSandboxParams = z.infer<typeof DeleteSandboxParamsSchema>;
export type ResetSandboxParams = z.infer<typeof ResetSandboxParamsSchema>;
