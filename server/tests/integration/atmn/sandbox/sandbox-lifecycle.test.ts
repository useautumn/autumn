/**
 * atmn sandbox — one isolated catalog, from mint to delete.
 *
 * Everything runs through the real CLI, because the whole point of the command
 * is the `.env` it leaves behind: the key it writes is shown once, and the pin
 * it writes is what silently redirects every later push. A test that called the
 * API directly would prove none of that.
 *
 * Contract:
 *   B1  create --use mints a sandbox and writes its key and the pin to .env
 *   B2  list shows it, marked as the sandbox commands target
 *   B3  the pin sends push at the sandbox: the config lands there, not on the
 *       org, and pulling it back leaves the file alone
 *   B4  delete --yes removes it from list and scrubs both lines from .env
 */

import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	initAtmnScenario,
	runCli,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sandboxKeyName } from "../../../../../packages/atmn-nightly/src/env/sandboxKeyName";
import {
	type AutumnClient,
	createClient,
} from "../../../../../packages/atmn-nightly/src/generated/client";
import { uniqueTestId } from "../../catalog-v2/utils/uniqueTestId.js";

const CREATED_LINE = /^Created sandbox .+ \((?<id>[^)]+)\)\.$/m;

const createdSandboxId = ({ output }: { output: string }): string => {
	const id = CREATED_LINE.exec(output)?.groups?.id;
	if (id === undefined)
		throw new Error(`create printed no sandbox id:\n${output}`);
	return id;
};

const envText = ({ cwd }: { cwd: string }): string => {
	const path = join(cwd, ".env");
	return existsSync(path) ? readFileSync(path, "utf8") : "";
};

const envValue = ({
	cwd,
	key,
}: {
	cwd: string;
	key: string;
}): string | undefined =>
	envText({ cwd })
		.split("\n")
		.find((line) => line.startsWith(`${key}=`))
		?.slice(key.length + 1);

const liveFeatureIds = async ({
	client,
}: {
	client: AutumnClient;
}): Promise<string[]> => {
	const catalog = (await client.get({})) as unknown as {
		features: { id: string; archived?: boolean | null }[];
	};
	return catalog.features
		.filter((feature) => feature.archived !== true)
		.map((feature) => feature.id)
		.sort();
};

test(`${chalk.yellowBright("atmn sandbox: mint, target, delete")}`, async () => {
	const messages = uniqueTestId("atmn_sb_messages");
	const sandboxName = uniqueTestId("atmn-sb");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn_sb")}@autumn.test`,
			}),
		],
		config: `{ features: [
				feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
			] }`,
	});
	const { cwd, secretKey, baseUrl } = scenario;
	// The CLI writes to the first .env on its search path; without one here
	// that could be a file outside the scenario.
	scenario.writeFile(".env", "");

	const atmn = (args: string[]): string =>
		runCli({ cwd, args, secretKey, baseUrl });

	try {
		// B1 — the key is shown once, so it has to land on disk.
		const created = atmn(["sandbox", "create", sandboxName, "--use"]);
		const sandboxId = createdSandboxId({ output: created });
		const keyName = sandboxKeyName({ sandboxId });

		expect(created).toContain(`as ${keyName}.`);
		expect(created).toContain(`Pinned AUTUMN_SANDBOX_ID=${sandboxId};`);

		const sandboxKey = envValue({ cwd, key: keyName });
		if (sandboxKey === undefined)
			throw new Error(`create wrote no ${keyName}:\n${created}`);
		expect(envValue({ cwd, key: "AUTUMN_SANDBOX_ID" })).toBe(sandboxId);

		// B2 — the pin is what "current" means.
		const listed = atmn(["sandbox", "list"]);
		expect(listed).toContain(sandboxId);
		expect(listed).toContain(sandboxName);
		expect(listed).toContain("current");

		// B3 — the pin redirects push; the org's own catalog stays empty.
		await scenario.push();

		const sandboxClient = createClient({ secretKey: sandboxKey, baseUrl });
		expect(await liveFeatureIds({ client: sandboxClient })).toEqual([messages]);
		expect(await liveFeatureIds({ client: scenario.client })).toEqual([]);

		const pulled = await scenario.pull();
		expect(pulled.appended).toEqual([]);
		expect(pulled.replaced).toEqual([]);
		expect(pulled.deleted).toEqual([]);

		// B4 — deleting takes the sandbox and both of its .env lines.
		const deleted = atmn(["sandbox", "delete", sandboxId, "--yes"]);
		expect(deleted).toContain(`Deleted sandbox ${sandboxName} (${sandboxId}).`);

		expect(envText({ cwd })).not.toContain(keyName);
		expect(envValue({ cwd, key: "AUTUMN_SANDBOX_ID" })).toBeUndefined();
		// The org key survives: only the sandbox's own lines go.
		expect(atmn(["sandbox", "list"])).not.toContain(sandboxId);
	} finally {
		scenario.cleanup();
	}
}, 600_000);

test(`${chalk.yellowBright("atmn sandbox: delete needs --yes, and an unknown id is refused")}`, async () => {
	const sandboxName = uniqueTestId("atmn-sb-gate");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn_sb_gate")}@autumn.test`,
			}),
		],
		config: `{ features: [] }`,
	});
	const { cwd, secretKey, baseUrl } = scenario;
	scenario.writeFile(".env", "");

	const atmn = (args: string[]): string =>
		runCli({ cwd, args, secretKey, baseUrl });

	try {
		const sandboxId = createdSandboxId({
			output: atmn(["sandbox", "create", sandboxName]),
		});

		// Nothing is sent without --yes: the sandbox is still listed after.
		const gated = atmn(["sandbox", "delete", sandboxId]);
		expect(gated).toContain(
			`This deletes sandbox ${sandboxName} (${sandboxId}) and everything in it. Re-run with --yes to delete.`,
		);
		expect(atmn(["sandbox", "list"])).toContain(sandboxId);

		// A typo is the CLI's error, not a request the server has to refuse.
		expect(() =>
			atmn(["sandbox", "delete", "org_not_a_sandbox", "--yes"]),
		).toThrow(/No sandbox with id org_not_a_sandbox\. Run atmn sandbox list\./);

		atmn(["sandbox", "delete", sandboxId, "--yes"]);
		expect(atmn(["sandbox", "list"])).not.toContain(sandboxId);
	} finally {
		scenario.cleanup();
	}
}, 600_000);
