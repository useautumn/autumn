/**
 * atmn push — plans, their items, versions, and licenses land in the catalog.
 *
 * Companion to push-features: same config-in / catalog-out contract, extended
 * to plans. Assertions read the DB (ProductService.listFull) or the catalogV2
 * get client, never the CLI's rendered text.
 *
 * Contract:
 *   P1  a config with one feature and two plans (a free default plan with an
 *       included-usage item, and a paid monthly plan with a flat price, a
 *       prepaid seat item with a price, and a 14-day free trial) creates both
 *       plans with those items and the trial; re-pushing the same config is a
 *       no-op (preview has no create/update/delete rows)
 *   P2  pushing `pro` v1, then a config with `pro` v2 in `plans` (price
 *       changed) and the v1 row in `planVersions`, leaves two versions of
 *       `pro` — v2 active, v1 inactive; a third push adding `pro` v3 as a
 *       draft (`active: false` in `plans`) alongside v2 leaves three
 *       versions, v2 still active
 *   P3  pushing `seat` and `enterprise` where `enterprise` licenses `seat`
 *       with `included: 25` links the two plans with that included count
 */

import { expect, test } from "bun:test";
import { join } from "node:path";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
// Relative rather than a package import, for the same reason initAtmnScenario
// imports runPush that way: the package publishes only its bin.
import {
	type AutumnClient,
	createClient,
} from "../../../../packages/atmn-nightly/src/generated/client";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

const CLI_PACKAGE_DIR = join(
	import.meta.dir,
	"../../../../packages/atmn-nightly",
);

/**
 * initAtmnScenario's default source only imports `feature` — these tests also
 * need the `plan` builder, so this extends it inline rather than widening the
 * shared helper for one file's needs.
 */
const atmnConfigSourceWithPlans = ({ body }: { body: string }): string =>
	`import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn(${body});
`;

const APPLIED_PLAN_ACTIONS = new Set(["create", "update", "delete"]);

/** Rows with a real action — the same filter runPush's renderer applies. */
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

/** Every live version row for a plan_id, oldest first — catalogV2.get only
 * ever returns the active one, so versioning needs the DB directly. */
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
			planId: "${freePlan}",
			name: "Free",
			autoEnable: true,
			items: [{ featureId: "${seats}", included: 1 }],
		}),
		plan({
			planId: "${proPlan}",
			name: "Pro",
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

			// Re-pushing the unchanged config previews nothing to create, update,
			// or delete — read off the structured preview, never rendered text.
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
			planId: "${pro}",
			name: "Pro",
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

			// v2 mints under a new slug with a changed price; v1 is restated in
			// planVersions, which stamps it inactive.
			scenario.writeConfig(
				atmnConfigSourceWithPlans({
					body: `{
	plans: [
		plan({
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v2",
			price: { amount: 20, interval: "month" },
		}),
	],
	planVersions: [
		plan({
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

			// A third push mints v3 as an explicit draft alongside the still-active v2.
			scenario.writeConfig(
				atmnConfigSourceWithPlans({
					body: `{
	plans: [
		plan({
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
			planId: "${seatPlan}",
			name: "Seat",
			price: { amount: 15, interval: "month" },
		}),
		plan({
			planId: "${enterprisePlan}",
			name: "Enterprise",
			price: { amount: 12000, interval: "year" },
			licenses: [{ licensePlanId: "${seatPlan}", included: 25 }],
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
