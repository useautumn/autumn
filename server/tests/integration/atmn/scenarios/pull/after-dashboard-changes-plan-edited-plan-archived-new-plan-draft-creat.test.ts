/**
 * atmn scenarios/pull — after dashboard changes [plan edited, plan archived, new plan, draft created] → config reflects each
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const baseConfig = (planId: string) =>
	`${atmnImports()}
export default atmn({
	plans: [
		plan({
			planId: "${planId}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
		}),
	],
});
`;

test.concurrent(
	"after dashboard changes [plan edited] → config reflects it",
	async () => {
		const planId = uniqueTestId("atmn_dash_edit");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: baseConfig(planId) },
		});

		try {
			await scenario.push();
			await scenario.client.update({
				plans: [{ plan_id: planId, price: { amount: 30, interval: "month" } }],
				skip_deletions: false,
				migration: { draft: true },
			});

			await scenario.pull();
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
			expect(scenario.files().get("autumn.config.ts")).toContain("amount: 30");
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	"after dashboard changes [plan archived] → the archive takes; pull does not choke on the row it can no longer see",
	async () => {
		// Decision pending: applyPreview treats archived catalog rows as server
		// history and never writes them into a fixture, so the shape pull leaves
		// the config in here is the open question — the only claim this asserts
		// with confidence is that the archive lands server-side and pull survives it.
		const planId = uniqueTestId("atmn_dash_archive");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: baseConfig(planId) },
		});

		try {
			await scenario.push();
			await scenario.client.update({
				plans: [{ plan_id: planId, archived: true }],
				skip_deletions: false,
				migration: { draft: true },
			});

			await scenario.pull();

			const catalog = (await scenario.client.get({})) as {
				plans: { id: string }[];
			};
			expect(catalog.plans.some((row) => row.id === planId)).toBe(false);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	"after dashboard changes [new plan] → config reflects it",
	async () => {
		const planId = uniqueTestId("atmn_dash_existing");
		const newPlanId = uniqueTestId("atmn_dash_new");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: baseConfig(planId) },
		});

		try {
			await scenario.push();
			// skip_deletions: true — this call only states the new plan; the
			// existing one must survive untouched, not be read as absentee.
			await scenario.client.update({
				plans: [
					{
						plan_id: newPlanId,
						name: "New",
						price: { amount: 15, interval: "month" },
					},
				],
				skip_deletions: true,
				migration: { draft: true },
			});

			const pulled = await scenario.pull();
			expect(pulled.appended).toContain(`${newPlanId}@v1`);
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
			expect(scenario.files().get("autumn.config.ts")).toContain(
				`planId: "${newPlanId}"`,
			);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	"after dashboard changes [draft created] → config reflects it",
	async () => {
		const planId = uniqueTestId("atmn_dash_draft");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: baseConfig(planId) },
		});

		try {
			await scenario.push();

			// Minting a draft alongside the still-active row, the same shape push
			// uses for a v3 draft: the live row restated, plus the new inactive one.
			await scenario.client.update({
				plans: [
					{
						plan_id: planId,
						name: "Pro",
						active: true,
						price: { amount: 20, interval: "month" },
					},
					{
						plan_id: planId,
						version_slug: "v2",
						active: false,
						price: { amount: 99, interval: "month" },
					},
				],
				skip_deletions: false,
				migration: { draft: true },
			});

			await scenario.pull();
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			const text = scenario.files().get("autumn.config.ts") ?? "";
			expect(text).toContain("active: false");
			expect(text).toContain("amount: 99");
		} finally {
			scenario.cleanup();
		}
	},
);
