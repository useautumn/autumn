import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"a spread object on the root (`atmn({ ...shared, plans })`) never silently appends nowhere for a remote-only feature living inside `shared`",
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const pro = uniqueTestId("atmn_pro");
		const remoteFeatureId = uniqueTestId("atmn_remote_feat");

		const rootConfig = `import { shared } from "./shared";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({
	...shared,
	plans: [plan({ active: true, planId: "${pro}", name: "Pro", versionSlug: "v1", })],
});
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"shared.ts": `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";

export const shared = {
	features: [
		feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
	],
};
`,
			},
		});

		try {
			await scenario.push();

			const before = scenario.files();
			const wire = await scenario.wireFromConfig();
			const features = (wire.features as Record<string, unknown>[]) ?? [];
			await scenario.client.update({
				...wire,
				features: [
					...features,
					{
						feature_id: remoteFeatureId,
						name: "Remote Feature",
						type: "boolean",
					},
				],
			});

			let thrown: unknown;
			try {
				await scenario.pull();
			} catch (error) {
				thrown = error;
			}
			const after = scenario.files();

			if (thrown === undefined) {
				expect(after.get("shared.ts")).not.toBe(before.get("shared.ts"));
				expect(after.get("shared.ts")).toContain(
					`featureId: "${remoteFeatureId}"`,
				);
			} else {
				expect(String(thrown)).toContain("shared");
				expect([...after.entries()]).toEqual([...before.entries()]);
			}
		} finally {
			scenario.cleanup();
		}
	},
);
