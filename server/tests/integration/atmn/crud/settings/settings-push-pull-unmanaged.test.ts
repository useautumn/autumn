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
		const first = await scenario.push({ dryRun: true });
		expect(first.output).toContain("Settings (2)");
		expect(first.output).toContain("~ Multi-currency: false -> true");
		expect(first.output).toContain("~ Pay down overages: false -> true");

		const { freshWire } = await expectRoundTrip({ scenario });
		expect(freshWire.settings).toEqual({
			multi_currency: true,
			persist_free_overage: true,
		});

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

		const pulled = await scenario.pull();
		expect(pulled.output).toContain("~ settings.paydownOverages");
		expect(scenario.files().get("autumn.config.ts")).toContain(
			"paydownOverages: true",
		);

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
		expect(applied.output).toContain("Applied settings.");
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

		scenario.writeConfig(
			`${scenario.files().get("autumn.config.ts")?.split("export default")[0]}export default atmn(${configBody(
				{ features: feature },
			)});\n`,
		);
		const untouched = await runCli({
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
