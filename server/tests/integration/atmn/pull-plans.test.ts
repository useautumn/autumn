/**
 * atmn pull — plans, their versions, and licenses come back out of the catalog.
 *
 * Companion to pull-features: same config-in / catalog-out contract, extended
 * to versioned plans. Identity is the stable `internalId` first, else
 * `planId` + `versionSlug`; the active row lands in `plans`, a newer inactive
 * row is a draft also in `plans` (`active: false`), older rows are history in
 * `planVersions`. Assertions read the re-imported wire, `ProductService.listFull`,
 * and the catalogV2 get client — never rendered text.
 *
 * Contract:
 *   L1  dir A pushes `pro` v1; dir B (same org) mints `pro` v2, restates v1 in
 *       `planVersions`, and adds `seat` plus `enterprise` (licensing `seat`).
 *       Pulling in A makes its wire match the catalog for all four plans, every
 *       pulled fixture gains `internalId`, and a follow-up dry-run push idles.
 *   L2  from L1's end state, dir B mints `pro` v3 as an explicit draft
 *       alongside the still-active v2. Pulling in A adds v3 with `active: false`
 *       while v2 stays active.
 *   L3  pulling an up-to-date config (L1's end state) leaves the file
 *       byte-identical.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type AtmnScenario,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
// Relative rather than a package import, for the same reason initAtmnScenario
// imports runPush that way: the package publishes only its bin.
import { runPull } from "../../../../packages/atmn-nightly/src/actions/pull";
import { runPush } from "../../../../packages/atmn-nightly/src/actions/push";
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

/**
 * A second config dir for the same org — initAtmnScenario mints one org per
 * call, so a second scenario would be a different catalog, not a second dir.
 */
const TMP_ROOT = join(
	import.meta.dir,
	"../../../../packages/atmn-nightly/test/.tmp",
);

const openConfigDir = (): {
	cwd: string;
	writeConfig: (source: string) => void;
	cleanup: () => void;
} => {
	const cwd = join(TMP_ROOT, uniqueTestId("atmn_pull_plans"));
	mkdirSync(cwd, { recursive: true });
	const configPath = join(cwd, "autumn.config.ts");
	return {
		cwd,
		writeConfig: (source: string): void => {
			writeFileSync(configPath, source, "utf8");
		},
		cleanup: () => rmSync(cwd, { recursive: true, force: true }),
	};
};

const readConfigText = ({ cwd }: { cwd: string }): string =>
	readFileSync(join(cwd, "autumn.config.ts"), "utf8");

const pullIn = async ({
	client,
	cwd,
}: {
	client: AutumnClient;
	cwd: string;
}) => {
	let output = "";
	const result = await runPull({
		client,
		cwd,
		write: (text: string) => {
			output += text;
		},
	});
	return { ...result, output };
};

const occurrencesOf = ({
	text,
	needle,
}: {
	text: string;
	needle: string;
}): number => text.split(needle).length - 1;

type WirePlanRow = Record<string, unknown>;

const wirePlans = async ({
	scenario,
}: {
	scenario: AtmnScenario & { ctx: AutumnContext };
}): Promise<WirePlanRow[]> => {
	const wire = (await scenario.wireFromConfig()) as { plans?: WirePlanRow[] };
	return wire.plans ?? [];
};

const findPlan = ({
	plans,
	planId,
	versionSlug,
}: {
	plans: WirePlanRow[];
	planId: string;
	versionSlug?: string;
}): WirePlanRow | undefined =>
	plans.find(
		(row) =>
			row.plan_id === planId &&
			(versionSlug === undefined || row.version_slug === versionSlug),
	);

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

type ProFixture = {
	scenario: AtmnScenario & { ctx: AutumnContext };
	server: {
		cwd: string;
		writeConfig: (source: string) => void;
		cleanup: () => void;
	};
	client: AutumnClient;
	ids: { seats: string; pro: string; seatPlan: string; enterprisePlan: string };
};

/**
 * L1's end state, reusable by L2 and L3: dir A pushes `pro` v1, dir B (same
 * org) mints v2, restates v1 in `planVersions`, and adds `seat` plus
 * `enterprise` (licensing `seat`), then A pulls.
 */
const pushProV1ThenV2WithLicensedSeat = async (): Promise<ProFixture> => {
	const seats = uniqueTestId("atmn_seats");
	const pro = uniqueTestId("atmn_pro");
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
	features: [
		feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
	],
	plans: [
		plan({
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 39, interval: "month" },
			items: [{ featureId: "${seats}", included: 1 }],
		}),
	],
}`,
		}),
	);
	await scenario.push();

	const server = openConfigDir();
	server.writeConfig(
		atmnConfigSourceWithPlans({
			body: `{
	plans: [
		plan({
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v2",
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "${seats}", included: 1 }],
		}),
		plan({
			planId: "${seatPlan}",
			name: "Seat",
			price: { amount: 15, interval: "month" },
		}),
		plan({
			planId: "${enterprisePlan}",
			name: "Enterprise",
			price: { amount: 200, interval: "month" },
			licenses: [{ licensePlanId: "${seatPlan}", included: 25 }],
		}),
	],
	planVersions: [
		plan({
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 39, interval: "month" },
			items: [{ featureId: "${seats}", included: 1 }],
		}),
	],
}`,
		}),
	);
	const client = createClient({
		secretKey: scenario.ctx.orgSecretKey,
		baseUrl: scenario.baseUrl,
	});
	await runPush({ client, cwd: server.cwd, write: () => {} });

	await pullIn({ client, cwd: scenario.cwd });

	return {
		scenario,
		server,
		client,
		ids: { seats, pro, seatPlan, enterprisePlan },
	};
};

test.concurrent(
	`${chalk.yellowBright("atmn pull: a pulled config executes to the catalog's plans, versions, and licenses")}`,
	async () => {
		const { scenario, server, ids } = await pushProV1ThenV2WithLicensedSeat();
		const { pro, seatPlan, enterprisePlan } = ids;

		try {
			const plans = await wirePlans({ scenario });
			const v1 = findPlan({ plans, planId: pro, versionSlug: "v1" });
			const v2 = findPlan({ plans, planId: pro, versionSlug: "v2" });
			const seatWire = findPlan({ plans, planId: seatPlan });
			const enterpriseWire = findPlan({ plans, planId: enterprisePlan });

			expect(v1).toEqual(
				expect.objectContaining({
					active: false,
					price: expect.objectContaining({ amount: 39, interval: "month" }),
				}),
			);
			expect(v2).toEqual(
				expect.objectContaining({
					active: true,
					price: expect.objectContaining({ amount: 49, interval: "month" }),
				}),
			);
			expect(seatWire).toBeDefined();
			expect(enterpriseWire).toEqual(
				expect.objectContaining({
					licenses: expect.arrayContaining([
						expect.objectContaining({
							license_plan_id: seatPlan,
							included: 25,
						}),
					]),
				}),
			);

			// Every one of the four pulled plan fixtures carries its internalId, and
			// so does the feature the first push backfilled.
			const text = readConfigText({ cwd: scenario.cwd });
			expect(occurrencesOf({ text, needle: "internalId:" })).toBe(5);

			expect(
				await livePlanVersions({ ctx: scenario.ctx, planId: pro }),
			).toEqual([
				{ version: 1, active: false },
				{ version: 2, active: true },
			]);

			// What the config says is now what the server has, so push idles.
			const dry = await scenario.push({ dryRun: true });
			expect(dry.output).toContain("No changes");
		} finally {
			scenario.cleanup();
			server.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn pull: a server-only draft version lands with active: false, the live version stays active")}`,
	async () => {
		const { scenario, server, client, ids } =
			await pushProV1ThenV2WithLicensedSeat();
		const { seats, pro, seatPlan, enterprisePlan } = ids;

		try {
			// v3 mints as an explicit draft alongside the still-active v2.
			server.writeConfig(
				atmnConfigSourceWithPlans({
					body: `{
	plans: [
		plan({
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v2",
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "${seats}", included: 1 }],
		}),
		plan({
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v3",
			active: false,
			price: { amount: 59, interval: "month" },
		}),
		plan({
			planId: "${seatPlan}",
			name: "Seat",
			price: { amount: 15, interval: "month" },
		}),
		plan({
			planId: "${enterprisePlan}",
			name: "Enterprise",
			price: { amount: 200, interval: "month" },
			licenses: [{ licensePlanId: "${seatPlan}", included: 25 }],
		}),
	],
	planVersions: [
		plan({
			planId: "${pro}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 39, interval: "month" },
			items: [{ featureId: "${seats}", included: 1 }],
		}),
	],
}`,
				}),
			);
			await runPush({ client, cwd: server.cwd, write: () => {} });

			await pullIn({ client, cwd: scenario.cwd });

			const plans = await wirePlans({ scenario });
			const v3 = findPlan({ plans, planId: pro, versionSlug: "v3" });
			const v2 = findPlan({ plans, planId: pro, versionSlug: "v2" });

			expect(v3).toEqual(
				expect.objectContaining({
					active: false,
					price: expect.objectContaining({ amount: 59, interval: "month" }),
				}),
			);
			expect(v2).toEqual(expect.objectContaining({ active: true }));

			expect(
				await livePlanVersions({ ctx: scenario.ctx, planId: pro }),
			).toEqual([
				{ version: 1, active: false },
				{ version: 2, active: true },
				{ version: 3, active: false },
			]);

			const text = readConfigText({ cwd: scenario.cwd });
			expect(occurrencesOf({ text, needle: "active: false" })).toBe(1);
		} finally {
			scenario.cleanup();
			server.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn pull: pulling an up-to-date plans config changes nothing")}`,
	async () => {
		const { scenario, server, client } =
			await pushProV1ThenV2WithLicensedSeat();

		try {
			const before = readConfigText({ cwd: scenario.cwd });

			const pulled = await pullIn({ client, cwd: scenario.cwd });
			expect(pulled.appended).toEqual([]);
			expect(pulled.replaced).toEqual([]);
			expect(pulled.deleted).toEqual([]);

			expect(readConfigText({ cwd: scenario.cwd })).toBe(before);
		} finally {
			scenario.cleanup();
			server.cleanup();
		}
	},
);
