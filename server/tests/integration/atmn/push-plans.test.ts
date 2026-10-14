import { expect, test } from "bun:test";
import { join } from "node:path";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	type AutumnClient,
	createClient,
} from "../../../../packages/atmn/src/generated/client";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

const CLI_PACKAGE_DIR = join(
	import.meta.dir,
	"../../../../packages/atmn",
);

const atmnConfigSourceWithPlans = ({ body }: { body: string }): string =>
	`import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn(${body});
`;

const APPLIED_PLAN_ACTIONS = new Set(["create", "update", "delete"]);

const changedRows = (
	rows: Array<{ action?: string }> | undefined,
): Array<{ action?: string }> =>
	(rows ?? []).filter(
		(row) => row.action !== undefined && APPLIED_PLAN_ACTIONS.has(row.action),
	);

type CatalogPlanRow = {
	id: string;
	price: { amount: number; interval: string } | null;
	items: Array<{
		featureId: string;
		included: number;
		price?: { amount?: number; billingMethod?: string } | null;
	}>;
	freeTrial?: { durationLength: number; durationType: string } | null;
	licenses?: Array<{ licensePlanId: string; included: number }>;
};

const liveCatalogPlans = async ({
	client,
}: {
	client: AutumnClient;
}): Promise<CatalogPlanRow[]> => {
	const catalog = (await client.get({})) as unknown as {
		plans: CatalogPlanRow[];
	};
	return catalog.plans;
};

const livePlanVersions = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<Array<{ version: number; active: boolean }>> => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});
	return products
		.map((product) => ({ version: product.version, active: product.active }))
		.sort((a, b) => a.version - b.version);
};

test.concurrent(
	`${chalk.yellowBright("atmn push: plans, their items, and a free trial land in the catalog")}`,
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const freePlan = uniqueTestId("atmn_free");
		const proPlan = uniqueTestId("atmn_pro");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: "{}",
		});
		scenario.writeConfig(
			atmnConfigSourceWithPlans({
				body: `{
	features: [
		feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
	],
	plans: [
		plan({
			active: true,
			planId: "${freePlan}",
			name: "Free",
			versionSlug: "v1",
			autoEnable: true,
			items: [{ featureId: "${seats}", included: 1 }],
		}),
		plan({
			active: true,
			planId: "${proPlan}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 49, interval: "month" },
			items: [
				{
					featureId: "${seats}",
					included: 1,
					price: {
						amount: 10,
						interval: "month",
						billingUnits: 1,
						billingMethod: "prepaid",
					},
				},
			],
			freeTrial: { durationLength: 14, durationType: "day" },
		}),
	],
}`,
			}),
		);
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			await scenario.push();

			const plans = await liveCatalogPlans({ client });
			const free = plans.find((row) => row.id === freePlan);
			const pro = plans.find((row) => row.id === proPlan);

			expect(free?.price).toBeNull();
			const freeItem = free?.items[0];
			expect(freeItem).toEqual(
				expect.objectContaining({ featureId: seats, included: 1 }),
			);
			expect(freeItem?.price).toBeNull();

			expect(pro?.price).toEqual(
				expect.objectContaining({ amount: 49, interval: "month" }),
			);
			const proItem = pro?.items[0];
			expect(proItem).toEqual(
				expect.objectContaining({ featureId: seats, included: 1 }),
			);
			expect(proItem?.price).toEqual(
				expect.objectContaining({ amount: 10, billingMethod: "prepaid" }),
			);
			expect(pro?.freeTrial).toEqual(
				expect.objectContaining({ durationLength: 14, durationType: "day" }),
			);

			const wire = await scenario.wireFromConfig();
			const preview = (await client.previewUpdate(wire)) as unknown as {
				features?: Array<{ action?: string }>;
				plans?: Array<{ action?: string }>;
			};
			expect(changedRows(preview.features)).toEqual([]);
			expect(changedRows(preview.plans)).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn push: minting a plan version keeps history rows, then adds a draft")}`,
	async () => {
		const pro = uniqueTestId("atmn_pro");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: "{}",
		});
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			scenario.writeConfig(
				atmnConfigSourceWithPlans({
					body: `{
	plans: [
		plan({
			active: true,
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 10, interval: "month" },
		}),
	],
}`,
				}),
			);
			await scenario.push();
			expect(
				await livePlanVersions({ ctx: scenario.ctx, planId: pro }),
			).toEqual([{ version: 1, active: true }]);

			scenario.writeConfig(
				atmnConfigSourceWithPlans({
					body: `{
	plans: [
		plan({
			active: true,
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v2",
			price: { amount: 20, interval: "month" },
		}),
	
		plan({
			active: false,
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 10, interval: "month" },
		}),
	],
}`,
				}),
			);
			await scenario.push();
			expect(
				await livePlanVersions({ ctx: scenario.ctx, planId: pro }),
			).toEqual([
				{ version: 1, active: false },
				{ version: 2, active: true },
			]);
			const afterV2 = await liveCatalogPlans({ client });
			expect(afterV2.find((row) => row.id === pro)?.price).toEqual(
				expect.objectContaining({ amount: 20 }),
			);

			scenario.writeConfig(
				atmnConfigSourceWithPlans({
					body: `{
	plans: [
		plan({
			active: true,
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v2",
			price: { amount: 20, interval: "month" },
		}),
		plan({
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v3",
			active: false,
			price: { amount: 30, interval: "month" },
		}),
		plan({
			active: false,
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 10, interval: "month" },
		}),
	],
}`,
				}),
			);
			await scenario.push();
			expect(
				await livePlanVersions({ ctx: scenario.ctx, planId: pro }),
			).toEqual([
				{ version: 1, active: false },
				{ version: 2, active: true },
				{ version: 3, active: false },
			]);
			const afterV3 = await liveCatalogPlans({ client });
			expect(afterV3.find((row) => row.id === pro)?.price).toEqual(
				expect.objectContaining({ amount: 20 }),
			);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn push: a plan's licenses link to the license plan with the config's included count")}`,
	async () => {
		const seatPlan = uniqueTestId("atmn_seat");
		const enterprisePlan = uniqueTestId("atmn_enterprise");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: "{}",
		});
		scenario.writeConfig(
			atmnConfigSourceWithPlans({
				body: `{
	plans: [
		plan({
			active: true,
			planId: "${seatPlan}",
			name: "Seat",
			versionSlug: "v1",
			price: { amount: 15, interval: "month" },
		}),
		plan({
			active: true,
			planId: "${enterprisePlan}",
			name: "Enterprise",
			versionSlug: "v1",
			price: { amount: 12000, interval: "year" },
			licenses: [{ licensePlanId: "${seatPlan}", versionSlug: "v1", included: 25 }],
		}),
	],
}`,
			}),
		);
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			await scenario.push();

			const plans = await liveCatalogPlans({ client });
			const enterprise = plans.find((row) => row.id === enterprisePlan);
			expect(enterprise?.licenses).toEqual([
				expect.objectContaining({ licensePlanId: seatPlan, included: 25 }),
			]);
		} finally {
			scenario.cleanup();
		}
	},
);
