import { anthropic } from "@ai-sdk/anthropic";
import { type AppEnv, type Feature, findFeatureById } from "@autumn/shared";
import { generateText, Output } from "ai";
import { z } from "zod/v4";
import { anthropicClient } from "@/external/ai/initAi.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "../FeatureService.js";

export interface GenerateFeatureDisplayWorkflowPayload {
	featureId: string;
	orgId: string;
	env: AppEnv;
}

export const llmGenerateFeatureDisplay = async ({
	feature,
}: {
	feature: Feature;
}) => {
	const prompt = `I'm building an entitlement system and my users can create features on my platform. I also help with displaying components (like pricing table) so I need to get the feature name in singular and plural form. 
  
  Based on the feature name passed in, please generate a singular and plural form, in lowercase.
  
  Only use uppercase if it makes sense to do so (like "API", or "AI", or "IP"), and the feature name passed in is already in uppercase. If not, follow the case of the feature name passed in.
  
  <feature>
    ID: ${feature.id}
    Name: ${feature.name}
  </feature>
  `;

	const { output } = await generateText({
		model: anthropic("claude-haiku-4-5"),
		output: Output.object({
			schema: z.object({
				singular: z.string(),
				plural: z.string(),
			}),
		}),
		prompt,
	});

	return output;
};

export const generateFeatureDisplayWorkflow = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: GenerateFeatureDisplayWorkflowPayload;
}) => {
	const { featureId } = payload;
	const { db, logger, features } = ctx;

	if (!anthropicClient) return;

	const feature = findFeatureById({
		features,
		featureId,
		errorOnNotFound: true,
	});

	const display = await llmGenerateFeatureDisplay({ feature });
	logger.info(
		`Generated display for feature ${feature.id}. singular: ${display.singular}, plural: ${display.plural}`,
	);

	await FeatureService.update({
		db,
		internalId: feature.internal_id,
		updates: {
			display,
		},
	});
};
