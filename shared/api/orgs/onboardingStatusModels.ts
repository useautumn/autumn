import { z } from "zod/v4";

export const OnboardingStatusSchema = z.object({
	catalog: z.boolean().describe("A plan exists that prices a feature."),
	customer: z.boolean().describe("At least one customer exists."),
	usage: z
		.boolean()
		.nullable()
		.describe("Usage has been tracked; null when analytics didn't answer."),
	deployed: z.boolean().describe("The org has moved to production."),
});

export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;
