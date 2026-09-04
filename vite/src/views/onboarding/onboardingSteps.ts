import type { OnboardingStepId } from "./hooks/useOnboardingProgress";

export interface OnboardingStepDefinition {
	id: OnboardingStepId;
	title: string;
	description: string;
	/** Stands alone on the sidebar card, so it reads as a next action. */
	shortTitle: string;
	waitingFor?: string;
}

export const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
	{
		id: "prompt",
		title: "Set up with your coding agent",
		shortTitle: "Copy the setup prompt",
		description:
			"Paste this into Cursor, Claude Code, or whichever agent you use. It reads the guide and takes it from there.",
		waitingFor: "Waiting for your agent",
	},
	{
		id: "catalog",
		title: "Create your plans",
		shortTitle: "Create your plans",
		description:
			"What you sell, what each plan includes, and what it costs — written to autumn.config.ts and pushed here.",
		waitingFor: "Waiting for a plan",
	},
	{
		id: "customer",
		title: "Create a customer",
		shortTitle: "Create a customer",
		description:
			"Your app tells Autumn who's paying, then attaches a plan to them.",
		waitingFor: "Waiting for a customer",
	},
	{
		id: "usage",
		title: "Check and track usage",
		shortTitle: "Track some usage",
		description:
			"Check before a customer uses a feature, track after it succeeds. Autumn keeps the balance.",
		waitingFor: "Waiting for an event",
	},
	{
		id: "deploy",
		title: "Go to production",
		shortTitle: "Go to production",
		description:
			"Connect your live Stripe account, copy your plans across, and swap in a production key.",
	},
];
