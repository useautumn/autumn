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

const row = ({
	planId,
	archived,
}: {
	planId: string;
	archived: boolean;
}): string => {
	if (planId !== "enterprise") {
		return `\n\t\t\tplan({ active: true, planId: "${planId}", versionSlug: "v1", archived: ${archived} }),`;
	}
	const licenses = archived
		? "[]"
		: `[{ licensePlanId: "seat", versionSlug: "v1", included: 25 }]`;
	return `\n\t\t\tplan({ active: true, planId: "enterprise", versionSlug: "v1", archived: ${archived}, licenses: ${licenses} }),`;
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
