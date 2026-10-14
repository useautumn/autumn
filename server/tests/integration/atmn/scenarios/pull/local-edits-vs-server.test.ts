import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const configFor = ({ planId, amount }: { planId: string; amount: number }) =>
	`${atmnImports()}
export default atmn({
	plans: [
		plan({
			active: true,
			planId: "${planId}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: ${amount}, interval: "month" },
		}),
	],
});
`;

test.concurrent(
	"local edits vs server → server copy wins, reported as `~`",
	async () => {
		const planId = uniqueTestId("atmn_local_edit");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: configFor({ planId, amount: 20 }) },
		});

		try {
			await scenario.push();

			scenario.writeConfig(configFor({ planId, amount: 99 }));

			const pulled = await scenario.pull();
			expect(pulled.replaced).toContain(`${planId}@v1`);
			expect(pulled.output).toContain(`~ ${planId}@v1`);

			const text = scenario.files().get("autumn.config.ts") ?? "";
			expect(text).toContain("amount: 20");
			expect(text).not.toContain("amount: 99");
		} finally {
			scenario.cleanup();
		}
	},
);
