import { z } from "zod/v4";

/**
 * Whether each onboarding step is done, resolved server-side so the dashboard
 * renders progress from one payload instead of racing four queries.
 *
 * `usage` is nullable: it's the only check backed by analytics, so it degrades
 * to unknown rather than holding up (or failing) the rest.
 */
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
