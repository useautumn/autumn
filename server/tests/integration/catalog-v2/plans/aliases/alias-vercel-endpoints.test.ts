/**
 * Ingress plan-id aliases on Vercel marketplace `billingPlanId`.
 */

import { expect, test } from "bun:test";
import { ApiVersion, CusProductStatus } from "@autumn/shared";
import {
	buildTestOidcHeaders,
	seedVercelCustomer,
	setupVercelOrg,
} from "@tests/integration/external-psps/vercel/utils/vercel-test-helpers.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { deleteAliases, renamePlan } from "../utils/planAliasTestUtils.js";

const baseUrl = () =>
	(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(
		/\/$/,
		"",
	);

const vercelPath = ({
	installationId,
	suffix,
}: {
	installationId: string;
	suffix: string;
}) =>
	`${baseUrl()}/webhooks/vercel/${ctx.org.id}/${ctx.env}/v1/installations/${installationId}${suffix}`;

test.concurrent(
	`${chalk.yellowBright("plan aliases vercel: create-resource / update-billing-plan billingPlanId")}`,
	async () => {
		const suffix = uniqueTestId("valias");
		const customerId = `${suffix}-cus`;
		const installationId = `icfg_${suffix}`;
		const otherInstallationId = `icfg_${suffix}_b`;
		const otherCustomerId = `${suffix}-cus-b`;
		const proRaw = products.pro({
			id: `${suffix}-pro`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		await setupVercelOrg(ctx);
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: suffix,
		});
		const oldId = proRaw.id;
		const newId = `${oldId}_n`;
		const planIds = [oldId, newId];
		const autumn = new AutumnInt({ version: ApiVersion.V2_3 });

		await deleteAliases({ ctx, planIds });
		try {
			await renamePlan({ autumn, fromId: oldId, toId: newId });

			const { internalCustomerId } = await seedVercelCustomer({
				ctx,
				customerId,
				installationId,
			});

			const createRes = await fetch(
				vercelPath({ installationId, suffix: "/resources" }),
				{
					method: "POST",
					headers: buildTestOidcHeaders(installationId, "user"),
					body: JSON.stringify({
						productId: oldId,
						billingPlanId: oldId,
						name: `${suffix} resource`,
					}),
				},
			);
			expect(createRes.status).toBe(200);
			const created = (await createRes.json()) as { billingPlan?: { id?: string } };
			expect(created.billingPlan?.id).toBe(newId);

			const cusProducts = await CusProductService.list({
				db: ctx.db,
				internalCustomerId,
				inStatuses: [CusProductStatus.Active, CusProductStatus.Trialing],
			});
			expect(cusProducts.some((row) => row.product_id === newId)).toBe(true);

			await seedVercelCustomer({
				ctx,
				customerId: otherCustomerId,
				installationId: otherInstallationId,
			});
			const updateRes = await fetch(
				vercelPath({ installationId: otherInstallationId, suffix: "" }),
				{
					method: "PATCH",
					headers: buildTestOidcHeaders(otherInstallationId, "user"),
					body: JSON.stringify({ billingPlanId: oldId }),
				},
			);
			expect(updateRes.status).toBe(200);
			const updated = (await updateRes.json()) as {
				billingPlan?: { id?: string };
			};
			expect(updated.billingPlan?.id).toBe(newId);
		} finally {
			await autumn.customers.delete(customerId).catch(() => {});
			await autumn.customers.delete(otherCustomerId).catch(() => {});
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
