import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

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
