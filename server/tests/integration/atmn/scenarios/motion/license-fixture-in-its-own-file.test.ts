/**
 * atmn scenarios/motion — a license link written as `license({...})` in its own file, placed into the parent's `licenses: [...]`
 *
 * code in motion: the config's shape is the user's; pull edits the AST, never rewrites a file
 *
 * Contract: push links seat under enterprise; pull writes nothing; changing
 * `included` in the license's file and pushing again previews an update on
 * the parent (a fresh CLI process, since the config is read from disk).
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"license fixture in its own file → push links it, pull is idle, an edit there previews an update",
	async () => {
		const seatsFeature = uniqueTestId("atmn_seats");
		const seat = uniqueTestId("atmn_seat");
		const enterprise = uniqueTestId("atmn_ent");

		const rootConfig = `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";
import { seatLink } from "./licenses/seat";

export default atmn({
	features: [
		feature({ featureId: "${seatsFeature}", name: "Seats", type: "metered", consumable: false }),
	],
	plans: [
		plan({
			planId: "${seat}",
			name: "Seat",
			price: { amount: 15, interval: "month" },
			items: [{ featureId: "${seatsFeature}", included: 1 }],
		}),
		plan({
			planId: "${enterprise}",
			name: "Enterprise",
			price: { amount: 999, interval: "month" },
			items: [],
			licenses: [seatLink],
		}),
	],
});
`;
		const licenseFile = ({ included }: { included: number }) =>
			`import { license } from "${CLI_PACKAGE_DIR}/src/generated/licenses";

export const seatLink = license({ licensePlanId: "${seat}", included: ${included} });
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: { raw: rootConfig },
			files: { "licenses/seat.ts": licenseFile({ included: 25 }) },
		});

		try {
			await scenario.push();
			const catalog = (await scenario.client.get({})) as {
				plans: {
					id: string;
					licenses?: { licensePlanId: string; included: number }[];
				}[];
			};
			const parent = catalog.plans.find((row) => row.id === enterprise);
			expect(parent?.licenses).toEqual([
				expect.objectContaining({ licensePlanId: seat, included: 25 }),
			]);

			const afterPush = scenario.files();
			const pulled = await scenario.pull();
			expect(pulled.appended).toEqual([]);
			expect(pulled.replaced).toEqual([]);
			expect(pulled.deleted).toEqual([]);
			expect([...scenario.files().entries()]).toEqual([...afterPush.entries()]);

			// Edit the link where it lives; a fresh process reads the new file.
			scenario.writeFile("licenses/seat.ts", licenseFile({ included: 30 }));
			const dryRun = Bun.spawnSync(
				["bun", `${CLI_PACKAGE_DIR}/src/cli.ts`, "push", "--dry-run"],
				{
					cwd: scenario.cwd,
					env: {
						...process.env,
						AUTUMN_SECRET_KEY: scenario.ctx.orgSecretKey,
						AUTUMN_BASE_URL: scenario.baseUrl,
					},
				},
			);
			const output = `${dryRun.stdout.toString()}${dryRun.stderr.toString()}`;
			expect(output).toContain(`~ ${enterprise}@v1`);
			expect(output).toContain("Included: 25 -> 30");
		} finally {
			scenario.cleanup();
		}
	},
);
