/**
 * atmn scenarios/archive — archived parent plan + archived license plan both restored in one push [parent listed first, license plan listed first] → both active, link intact, no order dependence
 *
 * one push carries the whole batch, so restore order must not matter
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import {
	enterpriseWithSeats,
	everyFeatureType,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

type CatalogPlanRow = {
	id: string;
	archived: boolean;
	licenses?: Array<{ licensePlanId: string; included: number }>;
};

const catalogPlans = async ({
	client,
}: {
	client: AutumnClient;
}): Promise<CatalogPlanRow[]> => {
	const catalog = (await client.get({ include_archived: true })) as unknown as {
		plans: CatalogPlanRow[];
	};
	return catalog.plans;
};

/**
 * Archive/restore is a partial update — only planId and the flag need
 * restating. The parent also carries its licenses[] every time: cleared
 * alongside `archived: true` (the anchor-lifecycle guard reads the still-
 * declared link regardless of the parent's own archived state, so the unlink
 * has to be same-call), and restated alongside `archived: false` so the
 * restore re-validates the link against the child's same-call unarchive.
 */
const row = ({
	planId,
	archived,
}: {
	planId: string;
	archived: boolean;
}): string => {
	if (planId !== "enterprise") {
		return `\n\t\t\tplan({ planId: "${planId}", archived: ${archived} }),`;
	}
	const licenses = archived
		? "[]"
		: `[{ licensePlanId: "seat", included: 25 }]`;
	return `\n\t\t\tplan({ planId: "enterprise", archived: ${archived}, licenses: ${licenses} }),`;
};

const pairBody = ({
	parentFirst,
	archived,
}: {
	parentFirst: boolean;
	archived: boolean;
}): string => {
	const rows = parentFirst
		? [
				row({ planId: "enterprise", archived }),
				row({ planId: "seat", archived }),
			]
		: [
				row({ planId: "seat", archived }),
				row({ planId: "enterprise", archived }),
			];
	return `{ plans: [${rows.join("")}] }`;
};

for (const order of [
	"parent listed first",
	"license plan listed first",
] as const) {
	test.concurrent(
		`${chalk.yellowBright(`atmn scenarios/archive: restoring the parent and its license plan together in one push [${order}] restores both with the link intact`)}`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
				config: `{ features: [${everyFeatureType}], plans: [${seatPlan}${enterpriseWithSeats({})}] }`,
			});

			try {
				await scenario.push();

				scenario.writeConfig(
					atmnConfigSource({
						body: pairBody({
							parentFirst: order === "parent listed first",
							archived: true,
						}),
					}),
				);
				await scenario.push();
				const archivedPlans = await catalogPlans({ client: scenario.client });
				expect(archivedPlans.find((p) => p.id === "seat")?.archived).toBe(true);
				expect(archivedPlans.find((p) => p.id === "enterprise")?.archived).toBe(
					true,
				);

				scenario.writeConfig(
					atmnConfigSource({
						body: pairBody({
							parentFirst: order === "parent listed first",
							archived: false,
						}),
					}),
				);
				await scenario.push();

				const restoredPlans = await catalogPlans({ client: scenario.client });
				const restoredSeat = restoredPlans.find((p) => p.id === "seat");
				const restoredEnterprise = restoredPlans.find(
					(p) => p.id === "enterprise",
				);
				expect(restoredSeat?.archived).toBe(false);
				expect(restoredEnterprise?.archived).toBe(false);
				expect(restoredEnterprise?.licenses).toEqual([
					expect.objectContaining({ licensePlanId: "seat", included: 25 }),
				]);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
