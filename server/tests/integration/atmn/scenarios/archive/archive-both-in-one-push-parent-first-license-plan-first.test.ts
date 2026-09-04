/**
 * atmn scenarios/archive — archive both in one push [parent first, license plan first] → both archived
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

type CatalogPlanRow = { id: string; archived: boolean };

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
 * Archiving is a partial update — only planId and the flag need restating.
 * The parent also clears its licenses[] in the same push: the anchor-lifecycle
 * guard reads the still-declared link regardless of the parent's own archived
 * state, so archiving both together needs the unlink to be same-call too.
 */
const archivedRow = (planId: string): string =>
	planId === "enterprise"
		? `\n\t\t\tplan({ planId: "enterprise", archived: true, licenses: [] }),`
		: `\n\t\t\tplan({ planId: "${planId}", archived: true }),`;

const archivedPairBody = ({
	parentFirst,
}: {
	parentFirst: boolean;
}): string => {
	const rows = parentFirst
		? [archivedRow("enterprise"), archivedRow("seat")]
		: [archivedRow("seat"), archivedRow("enterprise")];
	return `{ plans: [${rows.join("")}] }`;
};

for (const order of ["parent first", "license plan first"] as const) {
	test.concurrent(
		`${chalk.yellowBright(`atmn scenarios/archive: archiving the parent and its license plan in one push [${order}] archives both`)}`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
				config: `{ features: [${everyFeatureType}], plans: [${seatPlan}${enterpriseWithSeats({})}] }`,
			});

			try {
				await scenario.push();

				scenario.writeConfig(
					atmnConfigSource({
						body: archivedPairBody({ parentFirst: order === "parent first" }),
					}),
				);
				await scenario.push();

				const plans = await catalogPlans({ client: scenario.client });
				expect(plans.find((row) => row.id === "seat")?.archived).toBe(true);
				expect(plans.find((row) => row.id === "enterprise")?.archived).toBe(
					true,
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
