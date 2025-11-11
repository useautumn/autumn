import { createAnthropic } from "@ai-sdk/anthropic";
import type { Feature } from "@autumn/shared";
import { generateObject } from "ai";
import { z } from "zod";

const anthropic = createAnthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

export const generateFeatureDisplay = async (feature: Feature) => {
	const prompt = `I'm building an entitlement system and my users can create features on my platform. I also help with displaying components (like pricing table) so I need to get the feature name in singular and plural form. 
  
  Based on the feature name passed in, please generate a singular and plural form, in lowercase.
  
  Only use uppercase if it makes sense to do so (like "API", or "AI", or "IP"), and the feature name passed in is already in uppercase. If not, follow the case of the feature name passed in.
  
  <feature>
    ID: ${feature.id}
    Name: ${feature.name}
  </feature>
  `;

	const { object } = await generateObject({
		model: anthropic("claude-haiku-4-5"),
		schema: z.object({
			singular: z.string(),
			plural: z.string(),
		}),
		prompt,
	});

	return object;
};
