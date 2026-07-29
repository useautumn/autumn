import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { getAutumnAuth } from "../server/auth/auth.js";
import { mcpAnnotations } from "./utils/annotations.js";
import { callAutumnGet } from "./utils/client.js";

const organizationMeSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	env: z.string(),
	user: z
		.object({
			id: z.string(),
			email: z.string(),
			name: z.string(),
		})
		.nullish(),
});

const signalOf = (context: { mcp?: { extra?: { signal?: AbortSignal } } }) =>
	context?.mcp?.extra?.signal;

export const orgTools = {
	getCurrentOrganization: createTool({
		id: "getCurrentOrganization",
		description:
			"Fetch the current Autumn organization name, slug, and environment.",
		inputSchema: z.object({}).strict(),
		mcp: { annotations: mcpAnnotations() },
		execute: async (_input, context) =>
			organizationMeSchema.parse(
				await callAutumnGet({
					auth: getAutumnAuth(context),
					endpoint: "/v1/organization/me",
					signal: signalOf(context),
				}),
			),
	}),
} as const;
