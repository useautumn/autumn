import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	initAtmnScenario,
	runCli,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sandboxKeyName } from "../../../../../packages/atmn/src/env/sandboxKeyName";
import {
	type AutumnClient,
	createClient,
} from "../../../../../packages/atmn/src/generated/client";
import { uniqueTestId } from "../../catalog-v2/utils/uniqueTestId.js";

const CREATED_LINE = /^Created sandbox .+ \((?<id>[^)]+)\)\.$/m;

const createdSandboxId = ({ output }: { output: string }): string => {
	const id = CREATED_LINE.exec(output)?.groups?.id;
	if (id === undefined)
		throw new Error(`create printed no sandbox id:\n${output}`);
	return id;
};

const envValue = ({
	cwd,
	key,
}: {
	cwd: string;
	key: string;
}): string | undefined => {
	const path = join(cwd, ".env");
	if (!existsSync(path)) return undefined;
	return readFileSync(path, "utf8")
		.split("\n")
		.find((line) => line.startsWith(`${key}=`))
		?.slice(key.length + 1);
};

const liveCatalog = async ({
	client,
}: {
	client: AutumnClient;
}): Promise<{ features: string[]; plans: string[] }> => {
	const catalog = (await client.get({})) as unknown as {
		features: { id: string; archived?: boolean | null }[];
		plans: { id: string; archived?: boolean | null }[];
	};
	return {
		features: catalog.features
			.filter((feature) => feature.archived !== true)
			.map((feature) => feature.id)
			.sort(),
		plans: catalog.plans
			.filter((plan) => plan.archived !== true)
			.map((plan) => plan.id)
			.sort(),
	};
};

test(`${chalk.yellowBright("atmn reset: wipe a sandbox, then push it back")}`, async () => {
	const messages = uniqueTestId("atmn_reset_messages");
	const pro = uniqueTestId("atmn_reset_pro");
	const sandboxName = uniqueTestId("atmn-reset");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn_reset")}@autumn.test`,
			}),
		],
		config: `{ features: [
				feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
			], plans: [
				plan({ active: true, planId: "${pro}", name: "Pro", versionSlug: "v1", }),
			] }`,
	});
	const { cwd, secretKey, baseUrl } = scenario;
	scenario.writeFile(".env", "");

	const atmn = (args: string[]): Promise<string> =>
		runCli({ cwd, args, secretKey, baseUrl });

	let sandboxId: string | undefined;
	try {
		sandboxId = createdSandboxId({
			output: await atmn(["sandbox", "create", sandboxName, "--use"]),
		});
		const sandboxKey = envValue({
			cwd,
			key: sandboxKeyName({ sandboxId }),
		});
		if (sandboxKey === undefined)
			throw new Error("sandbox create wrote no key to the .env");

		const sandboxClient = createClient({ secretKey: sandboxKey, baseUrl });
		const populated = { features: [messages], plans: [pro] };

		await scenario.push();
		expect(await liveCatalog({ client: sandboxClient })).toEqual(populated);

		const gated = await atmn(["reset"]);
		expect(gated).toContain(
			`This wipes sandbox ${sandboxName} (${sandboxId}): every customer, plan, feature and migration draft. Keys and settings stay. Re-run with --yes to wipe.`,
		);
		expect(await liveCatalog({ client: sandboxClient })).toEqual(populated);

		const wiped = await atmn(["reset", "--yes"]);
		expect(wiped).toContain(
			`Wiped sandbox ${sandboxName} (${sandboxId}). Run atmn push to rebuild it from your config.`,
		);
		expect(await liveCatalog({ client: sandboxClient })).toEqual({
			features: [],
			plans: [],
		});

		expect(await liveCatalog({ client: scenario.client })).toEqual({
			features: [],
			plans: [],
		});

		await scenario.push();
		expect(await liveCatalog({ client: sandboxClient })).toEqual(populated);
	} finally {
		if (sandboxId !== undefined) {
			try {
				await atmn(["sandbox", "delete", sandboxId, "--yes"]);
			} catch (error) {
				console.warn(`reset-sandbox cleanup: delete failed — ${error}`);
			}
		}
		scenario.cleanup();
	}
}, 600_000);
