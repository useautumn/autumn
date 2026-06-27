import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	type AttachParamsV1Input,
	BillingInterval,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { expectVariantProductCorrect } from "../variants/utils/expectVariantProductCorrect.js";
import { expectPlanItemsCorrect } from "./utils/expectPlanItemsCorrect.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

const monthlyMessagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const basePrice = (amount: number, interval: BillingInterval) => ({
	amount,
	interval,
});

const getFullProduct = ({
	ctx,
	planId,
	version,
}: {
	ctx: { db: any; org: { id: string }; env: any };
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const getApiPlan = ({
	ctx,
	product,
}: {
	ctx: { features: any };
	product: Awaited<ReturnType<typeof getFullProduct>>;
}) =>
	getPlanResponse({
		ctx: ctx as any,
		product,
		features: ctx.features,
	});

test.concurrent(
	`${chalk.yellowBright("plan versioning: pro annual variant attached, base force-version propagates annual v2")}`,
	async () => {
		const customerId = "pro_annual_propagation";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const annualPlanId = `${pro.id}_annual`;

		await rpc.post("/plans.create_variant", {
			base_plan_id: pro.id,
			variant_plan_id: annualPlanId,
			name: "Pro Annual",
		});
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(annualPlanId, {
			price: basePrice(200, BillingInterval.Year),
			disable_version: true,
		});

		const proBeforeAttach = await getFullProduct({ ctx, planId: pro.id });
		const annualBeforeAttach = await getFullProduct({
			ctx,
			planId: annualPlanId,
		});
		expectVariantProductCorrect({
			base: proBeforeAttach,
			variant: annualBeforeAttach,
		});
		expectPlanItemsCorrect({
			plan: await getApiPlan({ ctx, product: annualBeforeAttach }),
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
				},
			],
			exact: true,
		});

		await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: annualPlanId,
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: annualPlanId,
		});
		await timeout(5000);
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(pro.id, {
			items: [monthlyMessagesItem(500)],
			price: basePrice(20, BillingInterval.Month),
			force_version: true,
			propagate_to_variants: [annualPlanId],
		});

		const proV1 = await getFullProduct({ ctx, planId: pro.id, version: 1 });
		const proV2 = await getFullProduct({ ctx, planId: pro.id });
		const annualV1 = await getFullProduct({
			ctx,
			planId: annualPlanId,
			version: 1,
		});
		const annualV2 = await getFullProduct({ ctx, planId: annualPlanId });

		expect(proV1.version).toBe(1);
		expect(proV2.version).toBe(2);
		expect(annualV1.version).toBe(1);
		expectVariantProductCorrect({
			base: proV2,
			variant: annualV2,
			version: 2,
		});
		const [proPlanV1, proPlanV2, annualPlanV1, annualPlanV2] =
			await Promise.all([
				getApiPlan({ ctx, product: proV1 }),
				getApiPlan({ ctx, product: proV2 }),
				getApiPlan({ ctx, product: annualV1 }),
				getApiPlan({ ctx, product: annualV2 }),
			]);

		expectPlanItemsCorrect({
			plan: proPlanV1,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
				},
			],
			exact: true,
		});
		expectPlanItemsCorrect({
			plan: proPlanV2,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 500,
					reset: { interval: ResetInterval.Month },
				},
			],
			exact: true,
		});
		expectPlanItemsCorrect({
			plan: annualPlanV1,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
				},
			],
			exact: true,
		});
		expectPlanItemsCorrect({
			plan: annualPlanV2,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 500,
					reset: { interval: ResetInterval.Month },
				},
			],
			exact: true,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [annualPlanId],
			notPresent: [pro.id],
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			planId: annualPlanId,
			granted: 100,
			remaining: 100,
		});
	},
);
