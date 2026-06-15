import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const listFeaturesSchema = z.object({}).strict();

const endpoints = {
	listFeatures: "/v1/features.list",
} as const;

const schemas = {
	listFeatures: listFeaturesSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "listFeatures",
			description: `
- List Autumn features for the current org.
- Use before custom plan/schedule items from feature names, aliases, or typos.
- Use when feature IDs, types, credit systems, or consumable behavior are unknown.
`.trim(),
		}),
	],
} satisfies ToolDomain;

export const features = { endpoints, schemas, domain };
