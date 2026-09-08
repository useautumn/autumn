/**
 * atmn crud/settings — the PATCH-shaped block.
 *
 * Push writes the flags the config states and nothing else; pull writes the
 * server's non-default flags into the block; removing a flag from the config
 * leaves it on the server and the preview says so.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	initAtmnScenario,
	runCli,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const feature = `
		feature({ featureId: "sso", name: "SSO", type: "boolean" }),`;

type SettingsPreview = {
	config: {
		changes: {
			key: string;
			action: string;
			previous: boolean;
			current: boolean | null;
		}[];
	};
};

test.concurrent("settings: push, pull, unmanaged", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			features: feature,
			settings: "multiCurrency: true, paydownOverages: true",
		}),
	});

	try {
		// The preview names the two stated flags moving, under their wire keys.
		const first = await scenario.push({ dryRun: true });
		expect(first.output).toContain("Settings (2)");
		expect(first.output).toContain("~ Multi-currency: false -> true");
		expect(first.output).toContain("~ Pay down overages: false -> true");

		// Push, preview clean, fresh pull scaffolds a config that previews clean.
		const { freshWire } = await expectRoundTrip({ scenario });
		expect(freshWire.settings).toEqual({
			multi_currency: true,
			persist_free_overage: true,
		});

		// The server holds only those two; every other settable flag is default.
		const preview = (await scenario.client.previewUpdateOrganization({
			config: {},
		})) as SettingsPreview;
		expect(preview.config.changes.map((change) => change.key).sort()).toEqual([
			"multi_currency",
			"persist_free_overage",
		]);
		expect(preview.config.changes.every((c) => c.action === "unmanaged")).toBe(
			true,
		);

		// Drop one flag from the config: it stays on, and push says it is unmanaged.
		scenario.writeConfig(
			`${scenario.files().get("autumn.config.ts")?.split("export default")[0]}export default atmn(${configBody(
				{ features: feature, settings: "multiCurrency: true" },
			)});\n`,
		);
		const unmanaged = await scenario.push({ dryRun: true });
		expect(unmanaged.output).toContain(
			"~ Pay down overages: true -> unmanaged (set false explicitly to disable; atmn won't override)",
		);
		expect(unmanaged.output).not.toContain("Multi-currency");

		// Pull writes the server's value back into the block.
		const pulled = await scenario.pull();
		expect(pulled.output).toContain("~ settings.paydownOverages");
		expect(scenario.files().get("autumn.config.ts")).toContain(
			"paydownOverages: true",
		);

		// State it false: push applies it, a pull removes the now-default pair.
		scenario.writeConfig(
			`${scenario.files().get("autumn.config.ts")?.split("export default")[0]}export default atmn(${configBody(
				{
					features: feature,
					settings: "multiCurrency: true, paydownOverages: false",
				},
			)});\n`,
		);
		const applied = await scenario.push();
		expect(applied.output).toContain("~ Pay down overages: true -> false");
		expect(applied.output).toContain("Applied.");
		const after = (await scenario.client.previewUpdateOrganization({
			config: {},
		})) as SettingsPreview;
		expect(after.config.changes.map((change) => change.key)).toEqual([
			"multi_currency",
		]);
		const dropped = await scenario.pull();
		expect(dropped.output).toContain("~ settings.paydownOverages");
		expect(scenario.files().get("autumn.config.ts")).not.toContain(
			"paydownOverages",
		);
		expect(scenario.files().get("autumn.config.ts")).toContain(
			"settings: { multiCurrency: true }",
		);

		// A config with no settings block never touches the organization.
		scenario.writeConfig(
			`${scenario.files().get("autumn.config.ts")?.split("export default")[0]}export default atmn(${configBody(
				{ features: feature },
			)});\n`,
		);
		const untouched = runCli({
			cwd: scenario.cwd,
			args: ["push", "--dry-run"],
			secretKey: scenario.secretKey,
			baseUrl: scenario.baseUrl,
		});
		expect(untouched).not.toContain("Settings");
	} finally {
		scenario.cleanup();
	}
});
