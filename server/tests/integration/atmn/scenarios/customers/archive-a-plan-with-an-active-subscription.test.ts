/**
 * atmn scenarios/customers — archive a plan with an active subscription → assert what the server does (refused or archived with customers kept)
 *
 * real `billing.attach` first; the point is to hit the dependency errors
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { runPush } from "../../../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

/** A single paid plan; omitting it from `plans` is how a config drops a plan. */
const catalogConfig = ({
	planId,
	includePlan,
}: {
	planId: string;
	includePlan: boolean;
}): string => `{
	plans: [${
		includePlan
			? `
		{
			planId: "${planId}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			createInStripe: false,
		},`
			: ""
	}
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: dropping a plan with an active subscription from the config archives it, customers kept")}`,
	async () => {
		const planId = uniqueTestId("atmn_cus_archive_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: catalogConfig({ planId, includePlan: true }),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId });

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${catalogConfig({ planId, includePlan: false })});
`,
			);

			const client = createClient({
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl: scenario.baseUrl,
			});
			const result = await runPush({ client, cwd: scenario.cwd });

			// Decision pending: the server archives a customered plan on removal
			// rather than refusing the push — this asserts that observed behavior.
			const planRow = (result.preview.plans ?? []).find(
				(row) => (row as { plan_id?: string }).plan_id === planId,
			);
			expect(planRow).toEqual(
				expect.objectContaining({
					action: "deleted",
					has_customers: true,
					will_archive: true,
				}),
			);

			const [product] = await ProductService.listFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				inIds: [planId],
				returnAll: true,
			});
			expect(product?.archived).toBe(true);

			const customer = await scenario.autumnV2_3.customers.get(
				scenario.customerId as unknown as string,
			);
			expect(customer.products?.some((product) => product.id === planId)).toBe(
				true,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
