/**
 * atmn crud/plans — config omitted at its default.
 *
 * The server always answers with `config`, but a fixture reads the same
 * without it while every flag is off: a fresh pull scaffolds no `config`.
 * The field is PATCH on the wire, so a plan that omits it leaves the flag
 * unmanaged: a dashboard flip is neither pulled nor overridden until the
 * config states the object, and a stated flag back at default is removed.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	expectPreviewNone,
	expectRoundTrip,
} from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const pro = ({ config }: { config?: string }) => `
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 49, interval: "month" },${
				config === undefined ? "" : `\n\t\t\tconfig: ${config},`
			}
			items: [],
		}),`;

type Catalog = { plans: Array<Record<string, unknown>> };

test.concurrent("plan config is omitted at its default", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({ plans: pro({}) }),
	});
	const proConfig = async () =>
		((await scenario.client.get({})) as Catalog).plans.find(
			(plan) => plan.id === "pro",
		)?.config;
	const configFile = () => scenario.files().get("autumn.config.ts") ?? "";
	const rewrite = ({ config }: { config?: string }) =>
		scenario.writeConfig(
			`${configFile().split("export default")[0]}export default atmn(${configBody(
				{ plans: pro({ config }) },
			)});\n`,
		);
	const setFlag = async (value: boolean) =>
		scenario.client.update({
			plans: [{ plan_id: "pro", config: { ignore_past_due: value } }],
			// biome-ignore lint/suspicious/noExplicitAny: a partial catalog update
		} as any);

	try {
		// A plan that never stated config scaffolds without it, and the server
		// still answers with the flag at its default.
		const { freshFiles, freshWire } = await expectRoundTrip({ scenario });
		expect(freshFiles.get("autumn.config.ts")).not.toContain("config");
		const plans = freshWire.plans as Array<Record<string, unknown>>;
		expect(
			plans.find((plan) => plan.plan_id === "pro")?.config,
		).toBeUndefined();
		expect(await proConfig()).toEqual({ ignorePastDue: false });

		// Flipped on elsewhere: an unstated config is unmanaged, so pull has
		// nothing to write and a push leaves the flag on.
		await setFlag(true);
		expect((await scenario.pull()).output).toContain("Nothing to pull.");
		expect(configFile()).not.toContain("config");
		await scenario.push();
		expect(await proConfig()).toEqual({ ignorePastDue: true });

		// Stated, it is managed: the server's revert removes the pair on pull
		// rather than writing the default back.
		rewrite({ config: "{ ignorePastDue: true }" });
		await expectPreviewNone({
			client: scenario.client,
			wire: await scenario.wireFromConfig(),
		});
		await setFlag(false);
		expect((await scenario.pull()).output).toContain("~ pro");
		expect(configFile()).not.toContain("config");
		await expectPreviewNone({
			client: scenario.client,
			wire: await scenario.wireFromConfig(),
		});

		// And a flag stated on pushes on.
		rewrite({ config: "{ ignorePastDue: true }" });
		await scenario.push();
		expect(await proConfig()).toEqual({ ignorePastDue: true });
	} finally {
		scenario.cleanup();
	}
});
