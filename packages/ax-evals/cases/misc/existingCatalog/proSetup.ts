import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

/**
 * The existing-catalog archetype: one live plan (Pro, $20/mo, 500 AI messages) that
 * already exists in the org — with ids written back into the config — before
 * the agent is asked to change it. Cases differ in who else touched the org
 * (a paying subscriber, a dashboard edit) and what change is requested.
 */

/** Environment facts only; the workflow (pull, version, push) is the skill's. */
export const existingCatalogPrimer = (state: string): string =>
	[
		"Project state (already verified, do not re-check): atmn is installed in",
		"node_modules, a valid AUTUMN_SECRET_KEY is in .env, and the config in this",
		`folder was pushed to the Autumn org earlier. ${state}`,
	].join(" ");

export const proV1Config = `import { atmn, feature, plan } from "atmn";

export const messages = feature({
	featureId: "ai_messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const sso = feature({
	featureId: "sso",
	name: "SSO",
	type: "boolean",
});

export const pro = plan({
	planId: "pro",
	versionSlug: "v1",
	active: true,
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		{
			featureId: "ai_messages",
			included: 500,
			reset: { interval: "month" },
		},
	],
});

export default atmn({ features: [messages, sso], plans: [pro] });
`;

export const proV1Spec: PlanSpec = {
	price: { amount: 20, interval: "month" },
	items: [{ included: 500, reset: { interval: "month" } }],
};

/** Known-correct outcome of the mint case: v2 active at $25, v1 kept for the
 * customers on it, carrying the id push wrote back the way a pulled row does. */
export const mintGoldenConfig = `import { atmn, feature, plan } from "atmn";

export const messages = feature({
	featureId: "ai_messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const sso = feature({
	featureId: "sso",
	name: "SSO",
	type: "boolean",
});

export const proV2 = plan({
	planId: "pro",
	versionSlug: "v2",
	active: true,
	name: "Pro",
	price: { amount: 25, interval: "month" },
	items: [
		{
			featureId: "ai_messages",
			included: 500,
			reset: { interval: "month" },
		},
	],
});

export const proV1 = plan({
	internalId: "prod_seeded",
	planId: "pro",
	versionSlug: "v1",
	active: false,
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		{
			featureId: "ai_messages",
			included: 500,
			reset: { interval: "month" },
		},
	],
});

export default atmn({ features: [messages, sso], plans: [proV2, proV1] });
`;

const seededIdLine = '\tinternalId: "prod_seeded",\n';

/** Known-correct outcome of the pull case: the dashboard's 1,000 messages
 * synced in, SSO added, and the row still carrying its server id. */
export const pullGoldenConfig = ({
	withInternalId = true,
}: {
	withInternalId?: boolean;
} = {}): string => `import { atmn, feature, plan } from "atmn";

export const messages = feature({
	featureId: "ai_messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const sso = feature({
	featureId: "sso",
	name: "SSO",
	type: "boolean",
});

export const pro = plan({
${withInternalId ? seededIdLine : ""}	planId: "pro",
	versionSlug: "v1",
	active: true,
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		{
			featureId: "ai_messages",
			included: 1000,
			reset: { interval: "month" },
		},
		{ featureId: "sso" },
	],
});

export default atmn({ features: [messages, sso], plans: [pro] });
`;
