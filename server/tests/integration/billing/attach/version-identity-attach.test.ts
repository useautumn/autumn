/**
 * Version identity — billing.attach omit-version uses the active catalog row.
 *
 * Contract under test:
 *   v2 active (lockstep) → omit attach lands on v2
 *   v1 forced active → omit attach lands on v1
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { ProductService } from "@/internal/products/ProductService.js";

type TestContext = Awaited<ReturnType<typeof initScenario>>["ctx"];

const monthlyMessagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const forceActiveVersion = async ({
	ctx,
	planId,
	version,
}: {
	ctx: TestContext;
	planId: string;
	version: number;
}) => {
	const versions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
		skipCache: true,
	});
	for (const product of versions) {
		if (product.active && product.version !== version) {
			await ProductService.updateByInternalId({
				db: ctx.db,
				internalId: product.internal_id,
				update: { active: false },
			});
		}
	}
	const target = versions.find((product) => product.version === version);
	expect(target).toBeDefined();
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: target!.internal_id,
		update: { active: true },
	});
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
};

const attachedVersion = ({
	customer,
	planId,
}: {
	customer: ApiCustomerV3;
	planId: string;
}) => customer.products.find((product) => product.id === planId)?.version;

test.concurrent(
	`${chalk.yellowBright("version identity attach: omit version with v2 active attaches v2")}`,
	async () => {
		const customerId = "vid-attach-lockstep";
		const pro = products.pro({
			id: "vid-attach-lockstep-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: pro.id,
					versioning: "new_version",
					items: [monthlyMessagesItem(500)],
				},
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });
		expect(attachedVersion({ customer, planId: pro.id })).toBe(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity attach: omit version with v1 forced active attaches v1")}`,
	async () => {
		const customerId = "vid-attach-active";
		const pro = products.pro({
			id: "vid-attach-active-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: pro.id,
					versioning: "new_version",
					items: [monthlyMessagesItem(500)],
				},
			],
		});
		await forceActiveVersion({ ctx, planId: pro.id, version: 1 });

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });
		expect(attachedVersion({ customer, planId: pro.id })).toBe(1);
	},
);
