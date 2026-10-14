import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;
type TestContext = Awaited<ReturnType<typeof initScenario>>["ctx"];

const monthlyMessagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const expectVersionIdentityCorrect = async ({
	ctx,
	planId,
	version,
	versionSlug,
	active,
}: {
	ctx: TestContext;
	planId: string;
	version: number;
	versionSlug: string;
	active: boolean;
}) => {
	const product = await ProductService.get({
		db: ctx.db,
		id: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	expect(product).toBeDefined();
	expect(product?.version).toBe(version);
	expect(product?.version_slug).toBe(versionSlug);
	expect(product?.active).toBe(active);
};

const setupPlan = async (testId: string) => {
	const base = products.base({
		id: `version_identity_${testId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx } = await initScenario({
		customerId: `version-identity-${testId}`,
		setup: [s.customer({}), s.products({ list: [base] })],
		actions: [],
	});
	return { autumnV2_3, ctx, planId: base.id };
};

test.concurrent(
	`${chalk.yellowBright("version identity: plan create mints v1 slug and active")}`,
	async () => {
		const { ctx, planId } = await setupPlan("create");

		await expectVersionIdentityCorrect({
			ctx,
			planId,
			version: 1,
			versionSlug: "v1",
			active: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity: legacy version mint activates v2 and deactivates v1")}`,
	async () => {
		const { ctx, planId } = await setupPlan("legacy");
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
			items: [monthlyMessagesItem(500)],
			force_version: true,
		});

		await expectVersionIdentityCorrect({
			ctx,
			planId,
			version: 2,
			versionSlug: "v2",
			active: true,
		});
		await expectVersionIdentityCorrect({
			ctx,
			planId,
			version: 1,
			versionSlug: "v1",
			active: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity: catalogV2 new_version mint activates v2 and deactivates v1")}`,
	async () => {
		const { autumnV2_3, ctx, planId } = await setupPlan("catalog");

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					items: [monthlyMessagesItem(700)],
					versioning: "new_version", active: true,
				},
			],
		});

		await expectVersionIdentityCorrect({
			ctx,
			planId,
			version: 2,
			versionSlug: "v2",
			active: true,
		});
		await expectVersionIdentityCorrect({
			ctx,
			planId,
			version: 1,
			versionSlug: "v1",
			active: false,
		});
	},
);
