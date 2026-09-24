import { defineCase } from "../../../src/cases/defineCase.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	existingCatalogPrimer,
	proV1Config,
	pullGoldenConfig,
} from "./proSetup.ts";

/** The "dashboard edit": Pro's allowance raised in place on the server after
 * the config was pushed, so the file in the workspace is behind the org. */
const raiseProAllowanceOnServer = async ({
	backendUrl,
	secretKey,
}: {
	backendUrl: string;
	secretKey: string;
}) => {
	const res = await fetch(`${backendUrl}/v1/catalogV2.update`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${secretKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			plans: [
				{
					plan_id: "pro",
					items: [
						{
							feature_id: "ai_messages",
							included: 1000,
							reset: { interval: "month" },
						},
					],
				},
			],
		}),
	});
	if (!res.ok) {
		throw new Error(
			`dashboard edit failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
		);
	}
};

/**
 * Existing catalog, sync: the org was edited in the dashboard after the last push,
 * then the user asks for a further change. Passing = the config ends up
 * holding both the dashboard's change (1,000 messages) and the new one (SSO),
 * on the same row — still carrying its server id — and nothing was pushed
 * (the user wants to review). The failure this catches: editing the stale file
 * and overwriting the dashboard change, or recreating the plan from scratch.
 */
export const pullDashboardEdit = defineCase({
	name: "existing-catalog-sync-dashboard-edit",
	prompt: [
		"someone bumped pro's message limit in the dashboard yesterday. can you sync that",
		"into the config, and while you're there give pro SSO too. don't push, I want to",
		"eyeball it first",
	].join(" "),
	scenario: {
		primer: existingCatalogPrimer(
			"The org has been edited in the dashboard since.",
		),
		seedCatalog: proV1Config,
		beforeAgent: raiseProAllowanceOnServer,
	},
	expect: [
		...catalog({
			plans: {
				"pro with the dashboard's 1000 messages and sso": {
					price: { amount: 20, interval: "month" },
					items: [{ included: 1000, reset: { interval: "month" } }],
				},
			},
			features: { "sso (boolean)": { type: "boolean", granted: true } },
		}),
		config.keepsInternalId("pro"),
		conduct.noUnapprovedPush(),
		conduct.wroteConfig(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: pullGoldenConfig(),
});

initAxEval({ axCase: pullDashboardEdit, maxTurns: 24, timeoutMs: 480_000 });
