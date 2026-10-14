import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
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
import type { AutumnClient } from "../../../../../../packages/atmn/src/generated/client";

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

const archivedRow = (planId: string): string =>
	planId === "enterprise"
		? `\n\t\t\tplan({ active: true, planId: "enterprise", versionSlug: "v1", archived: true, licenses: [] }),`
		: `\n\t\t\tplan({ active: true, planId: "${planId}", versionSlug: "v1", archived: true }),`;

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
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
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
