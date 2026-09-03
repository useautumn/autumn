/**
 * atmn pull — the catalog becomes the config file.
 *
 * Pull is push played backwards: the server's diff over a config drives the
 * edit, the file is the only thing that changes, and the CLI decides nothing
 * along the way.
 *
 * Assertions are config-in / catalog-out: a re-imported config must execute to
 * the server's rows, and surgery must leave no trace in the file. Nothing about
 * rendering, because the rendering is a report rather than a decision.
 *
 * Contract:
 *   L1  pulling after the server moved ahead makes the config match the
 *       catalog, and a follow-up push has nothing to apply
 *   L2  a fixture the server never had is deleted from the file, and the
 *       re-imported config still matches the server
 *   L3  pulling an up-to-date config leaves the file byte-identical
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type AtmnScenario,
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
// Relative rather than a package import, for the same reason initAtmnScenario
// imports runPush that way: the package publishes only its bin.
import { runPull } from "../../../../packages/atmn-nightly/src/actions/pull";
import { runPush } from "../../../../packages/atmn-nightly/src/actions/push";
import {
	type AutumnClient,
	createClient,
} from "../../../../packages/atmn-nightly/src/generated/client";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

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
	const cwd = join(TMP_ROOT, uniqueTestId("atmn_pull"));
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

const sortByFeatureId = (
	rows: Record<string, unknown>[],
): Record<string, unknown>[] =>
	[...rows].sort((a, b) =>
		String(a.feature_id).localeCompare(String(b.feature_id)),
	);

const wireFeatures = async ({
	scenario,
}: {
	scenario: AtmnScenario & { ctx: AutumnContext };
}): Promise<Record<string, unknown>[]> => {
	const wire = (await scenario.wireFromConfig()) as {
		features: Record<string, unknown>[];
	};
	return sortByFeatureId(wire.features);
};

/** The catalog rows, recased to the wire shape a config executes to. */
type CatalogFeatureRow = {
	id: string;
	name: string;
	type: string;
	consumable?: boolean;
	creditSchema?: {
		meteredFeatureId: string;
		billingUnits?: number;
		creditCost: number;
	}[];
	archived?: boolean;
};

const wireRowOf = ({
	row,
}: {
	row: CatalogFeatureRow;
}): Record<string, unknown> => ({
	feature_id: row.id,
	name: row.name,
	type: row.type,
	...(row.consumable ? { consumable: true } : {}),
	...(row.creditSchema
		? {
				credit_schema: row.creditSchema.map((item) => ({
					metered_feature_id: item.meteredFeatureId,
					...(item.billingUnits === undefined
						? {}
						: { billing_units: item.billingUnits }),
					credit_cost: item.creditCost,
				})),
			}
		: {}),
});

const serverWireRows = async ({
	client,
}: {
	client: AutumnClient;
}): Promise<Record<string, unknown>[]> => {
	const catalog = (await client.get({})) as unknown as {
		features: CatalogFeatureRow[];
	};
	return sortByFeatureId(
		catalog.features
			.filter((row) => row.archived !== true)
			.map((row) => wireRowOf({ row })),
	);
};

const configABody = ({
	seats,
	messages,
}: {
	seats: string;
	messages: string;
}): string => `{
	features: [
		feature({ featureId: "${seats}", name: "Seats", type: "boolean" }),
		feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn pull: a pulled config executes to the server's catalog")}`,
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const messages = uniqueTestId("atmn_messages");
		const credits = uniqueTestId("atmn_credits");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configABody({ seats, messages }),
		});

		// Same org, second dir: this is how one catalog gets two configs.
		const server = openConfigDir();
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			// The server moves ahead of A: the metered feature gets a new name and
			// a credit system joins, referencing it.
			server.writeConfig(
				atmnConfigSource({
					body: `{
	features: [
		feature({ featureId: "${seats}", name: "Seats", type: "boolean" }),
		feature({ featureId: "${messages}", name: "Messages Pro", type: "metered", consumable: true }),
		feature({
			featureId: "${credits}",
			name: "Credits",
			type: "credit_system",
			creditSchema: [{ meteredFeatureId: "${messages}", creditCost: 2 }],
		}),
	],
}`,
				}),
			);
			await runPush({ client, cwd: server.cwd, write: () => {} });

			// L1: pulling brings the rename and the new fixture into A.
			const pulled = await pullIn({ client, cwd: scenario.cwd });
			expect(pulled.appended).toEqual([credits]);
			expect(pulled.replaced).toEqual([messages]);
			expect(pulled.deleted).toEqual([]);

			expect(await wireFeatures({ scenario })).toEqual(
				await serverWireRows({ client }),
			);

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
	`${chalk.yellowBright("atmn pull: a fixture the server never had is deleted from the config")}`,
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const messages = uniqueTestId("atmn_messages");
		const extra = uniqueTestId("atmn_extra");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configABody({ seats, messages }),
		});
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			await scenario.push();

			// The extra fixture exists only in the file and is never pushed, so
			// the server is right and the file is wrong.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	features: [
		feature({ featureId: "${seats}", name: "Seats", type: "boolean" }),
		feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
		feature({ featureId: "${extra}", name: "Extra", type: "boolean" }),
	],
}`,
				}),
			);

			const pulled = await pullIn({ client, cwd: scenario.cwd });
			expect(pulled.deleted).toEqual([extra]);
			expect(pulled.appended).toEqual([]);
			expect(pulled.replaced).toEqual([]);

			expect(readConfigText({ cwd: scenario.cwd })).not.toContain(extra);
			expect(await wireFeatures({ scenario })).toEqual(
				await serverWireRows({ client }),
			);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn pull: pulling an up-to-date config changes nothing")}`,
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const messages = uniqueTestId("atmn_messages");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configABody({ seats, messages }),
		});
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			await scenario.push();
			const before = readConfigText({ cwd: scenario.cwd });

			const pulled = await pullIn({ client, cwd: scenario.cwd });
			expect(pulled.appended).toEqual([]);
			expect(pulled.replaced).toEqual([]);
			expect(pulled.deleted).toEqual([]);

			expect(readConfigText({ cwd: scenario.cwd })).toBe(before);
		} finally {
			scenario.cleanup();
		}
	},
);
