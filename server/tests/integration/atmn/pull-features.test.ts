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
import { runPull } from "../../../../packages/atmn/src/actions/pull";
import { runPush } from "../../../../packages/atmn/src/actions/push";
import {
	type AutumnClient,
	createClient,
} from "../../../../packages/atmn/src/generated/client";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

const TMP_ROOT = join(
	import.meta.dir,
	"../../../../packages/atmn/test/.tmp",
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
	return sortByFeatureId(wire.features).map((row) => {
		if (!Array.isArray(row.event_names) || row.event_names.length > 0)
			return row;
		const { event_names: _empty, ...rest } = row;
		return rest;
	});
};

type CatalogFeatureRow = {
	id: string;
	internalId?: string | null;
	name: string;
	type: string;
	consumable?: boolean;
	eventNames?: string[] | null;
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
	...(typeof row.internalId === "string"
		? { internal_id: row.internalId }
		: {}),
	name: row.name,
	type: row.type,
	...(row.consumable ? { consumable: true } : {}),
	...(row.eventNames?.length ? { event_names: row.eventNames } : {}),
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

		const server = openConfigDir();
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
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

			const pulled = await pullIn({ client, cwd: scenario.cwd });
			expect(pulled.appended).toEqual([credits]);
			expect(pulled.replaced).toEqual([messages]);
			expect(pulled.deleted).toEqual([]);

			expect(await wireFeatures({ scenario })).toEqual(
				await serverWireRows({ client }),
			);

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
