/**
 * atmn scenarios/customers — move a customered version into planVersions and activate a new row → customers stay on the old version, new attaches get the new one
 *
 * real `billing.attach` first; the point is to hit the dependency errors
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { customerProducts } from "@autumn/shared";
import { seedVersionableCustomer } from "@tests/integration/catalog-v2/plans/migrations/utils/seedVersionableCustomer.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";

const v1Config = ({ planId }: { planId: string }): string => `{
	plans: [
		{
			planId: "${planId}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 39, interval: "month" },
			createInStripe: false,
		},
	],
}`;

const v2Config = ({ planId }: { planId: string }): string => `{
	plans: [
		{
			planId: "${planId}",
			name: "Pro",
			versionSlug: "v2",
			price: { amount: 49, interval: "month" },
			createInStripe: false,
		},
	],
	planVersions: [
		{
			planId: "${planId}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 39, interval: "month" },
			createInStripe: false,
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: minting a new active version leaves existing customers on the old one, new attaches land on the new one")}`,
	async () => {
		const planId = uniqueTestId("atmn_cus_move_version");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: v1Config({ planId }),
		});

		try {
			await scenario.push();
			const { cusProductId } = await seedVersionableCustomer({
				ctx: scenario.ctx,
				planId,
				version: 1,
			});

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${v2Config({ planId })});
`,
			);
			await scenario.push();

			const products = await ProductService.listFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				inIds: [planId],
				returnAll: true,
			});
			const v1 = products.find((product) => product.version === 1);
			const v2 = products.find((product) => product.version === 2);
			expect(v1?.active).toBe(false);
			expect(v2?.active).toBe(true);

			const existingCusProduct =
				await scenario.ctx.db.query.customerProducts.findFirst({
					where: eq(customerProducts.id, cusProductId),
				});
			expect(existingCusProduct?.internal_product_id).toBe(v1?.internal_id);

			await scenario.attachCustomer({ planId });
			const newCustomer = await scenario.autumnV2_3.customers.get(
				scenario.customerId as unknown as string,
			);
			expect(newCustomer.products?.[0]?.id).toBe(planId);

			const newCusProduct =
				await scenario.ctx.db.query.customerProducts.findFirst({
					where: (row, { and, eq, ne }) =>
						and(eq(row.product_id, planId), ne(row.id, cusProductId)),
				});
			expect(newCusProduct?.internal_product_id).toBe(v2?.internal_id);
		} finally {
			scenario.cleanup();
		}
	},
);
