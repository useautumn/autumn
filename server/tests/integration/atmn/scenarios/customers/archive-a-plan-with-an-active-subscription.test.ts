import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { runPush } from "../../../../../../packages/atmn/src/actions/push";
import { createClient } from "../../../../../../packages/atmn/src/generated/client";

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
			active: true,
			versionSlug: "v1",
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

			const planRow = (result.preview.plans ?? []).find(
				(row) => (row as { planId?: string }).planId === planId,
			);
			expect(planRow).toEqual(
				expect.objectContaining({
					action: "delete",
					state: expect.objectContaining({
						hasCustomers: true,
						willArchive: true,
					}),
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
			expect(
				// @ts-expect-error autumnV2_3's declared return type defaults to ApiCustomerV3; this API version actually returns subscriptions/balances
				customer.subscriptions?.some(
					(subscription: { plan_id?: string }) =>
						subscription.plan_id === planId,
				),
			).toBe(true);
		} finally {
			scenario.cleanup();
		}
	},
);
