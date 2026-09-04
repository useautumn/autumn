/**
 * atmn scenarios/customers — remove a variant with customers on it → assert what the server does
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

/** A base plan with one nested variant; `archiveVariant` flips the variant's
 * own `archived` overlay, the config-side way to remove one. */
const catalogConfig = ({
	basePlanId,
	variantPlanId,
	archiveVariant,
}: {
	basePlanId: string;
	variantPlanId: string;
	archiveVariant: boolean;
}): string => `{
	plans: [
		{
			planId: "${basePlanId}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			createInStripe: false,
			variants: [
				{
					variantPlanId: "${variantPlanId}",
					name: "Pro Variant",${archiveVariant ? "\n\t\t\t\t\tarchived: true," : ""}
					customize: { price: { amount: 15, interval: "month" } },
				},
			],
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: archiving a variant with customers on it archives the row, customers kept")}`,
	async () => {
		const basePlanId = uniqueTestId("atmn_cus_variant_base");
		const variantPlanId = uniqueTestId("atmn_cus_variant_child");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: catalogConfig({
				basePlanId,
				variantPlanId,
				archiveVariant: false,
			}),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId: variantPlanId });

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${catalogConfig({ basePlanId, variantPlanId, archiveVariant: true })});
`,
			);

			// Decision pending: archiving the variant overlay archives that row
			// like any other plan, rather than being refused — asserting that.
			await scenario.push();

			const [variant] = await ProductService.listFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				inIds: [variantPlanId],
				returnAll: true,
				includeDeleted: true,
			});
			// The row must still exist (a customer holds it) and be archived.
			expect(variant).toBeDefined();
			expect(variant?.archived).toBe(true);

			const customer = await scenario.autumnV2_3.customers.get(
				scenario.customerId as unknown as string,
			);
			// The customer keeps the archived variant.
			expect(
				// @ts-expect-error the declared customer type predates this response shape
				customer.subscriptions?.some(
					(subscription: { plan_id?: string }) =>
						subscription.plan_id === variantPlanId,
				),
			).toBe(true);
		} finally {
			scenario.cleanup();
		}
	},
);
