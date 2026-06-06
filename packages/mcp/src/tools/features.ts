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
			description:
				"List Autumn features. Use when creating/customizing plan items or setting non-zero prepaid feature quantities and feature ids, types, credit systems, or consumable behavior are not already known.",
		}),
	],
} satisfies ToolDomain;

export const features = { endpoints, schemas, domain };
