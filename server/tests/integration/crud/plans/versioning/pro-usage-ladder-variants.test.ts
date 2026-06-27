import { test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanItemParamsV1Input,
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
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { expectVariantProductCorrect } from "../variants/utils/expectVariantProductCorrect.js";
import {
	expectPlanItemsCorrect,
	expectPlanPriceCorrect,
} from "./utils/expectPlanItemsCorrect.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

type LadderPlan = {
	idSuffix: string;
	name: string;
	included: number;
	basePrice: number;
	overagePrice: number;
};

const ladderPlans: LadderPlan[] = [
	{
		idSuffix: "3k",
		name: "Pro 3k",
		included: 3_000,
		basePrice: 99,
		overagePrice: 0.08,
	},
	{
		idSuffix: "4_5k",
		name: "Pro 4.5k",
		included: 4_500,
		basePrice: 149,
		overagePrice: 0.07,
	},
	{
		idSuffix: "6k",
		name: "Pro 6k",
		included: 6_000,
		basePrice: 199,
		overagePrice: 0.06,
	},
	{
		idSuffix: "9k",
		name: "Pro 9k",
		included: 9_000,
		basePrice: 299,
		overagePrice: 0.05,
	},
	{
		idSuffix: "120k",
		name: "Pro 120k",
		included: 120_000,
		basePrice: 999,
		overagePrice: 0.01,
	},
];

const productItems = ({
	included,
	overagePrice,
}: {
	included: number;
	overagePrice: number;
}) => [
	items.dashboard(),
	items.adminRights(),
	items.consumableMessages({
		includedUsage: included,
		price: overagePrice,
	}),
];

const apiPlanItems = ({
	included,
	overagePrice,
}: {
	included: number;
	overagePrice: number;
}): CreatePlanItemParamsV1Input[] => [
	{
		feature_id: TestFeature.Dashboard,
		unlimited: true,
	},
	{
		feature_id: TestFeature.AdminRights,
		unlimited: true,
	},
	{
		feature_id: TestFeature.Messages,
		included,
		reset: { interval: ResetInterval.Month },
		price: {
			amount: overagePrice,
			interval: BillingInterval.Month,
			billing_units: 1,
			billing_method: BillingMethod.UsageBased,
			max_purchase: null,
		},
	},
];

const getFullProduct = ({
	ctx,
	planId,
}: {
	ctx: { db: any; org: { id: string }; env: any };
	planId: string;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const getApiPlan = async ({
	ctx,
	planId,
}: {
	ctx: { db: any; org: { id: string }; env: any; features: any };
	planId: string;
}) => {
	const product = await getFullProduct({ ctx, planId });
	return getPlanResponse({
		ctx: ctx as any,
		product,
		features: ctx.features,
	});
};

const cleanupPlan = async ({
	rpc,
	planId,
}: {
	rpc: AutumnRpcCli;
	planId: string;
}) => {
	try {
		await rpc.plans.delete(planId, { allVersions: true });
	} catch {}
};

const expectProLadderPlanCorrect = ({
	plan,
	included,
	basePrice,
	overagePrice,
}: {
	plan: ApiPlanV1;
	included: number;
	basePrice: number;
	overagePrice: number;
}) => {
	expectPlanPriceCorrect({
		plan,
		price: {
			amount: basePrice,
			interval: BillingInterval.Month,
		},
	});
	expectPlanItemsCorrect({
		plan,
		items: [
			{
				feature_id: TestFeature.Dashboard,
				included: 0,
				unlimited: false,
				reset: null,
				price: null,
			},
			{
				feature_id: TestFeature.AdminRights,
				included: 0,
				unlimited: false,
				reset: null,
				price: null,
			},
			{
				feature_id: TestFeature.Messages,
				included,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: {
					amount: overagePrice,
					interval: BillingInterval.Month,
					billing_units: 1,
					billing_method: BillingMethod.UsageBased,
					max_purchase: null,
				},
			},
		],
		exact: true,
	});
};

test.concurrent(
	`${chalk.yellowBright("plan versioning: pro usage ladder variants keep shared booleans and custom overage")}`,
	async () => {
		const customerId = "pro_usage_ladder_variants";
		const pro1500 = products.base({
			id: "pro_1500",
			items: [
				items.monthlyPrice({ price: 49 }),
				...productItems({ included: 1_500, overagePrice: 0.09 }),
			],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro1500] }),
			],
			actions: [],
		});
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		for (const ladderPlan of ladderPlans) {
			await cleanupPlan({
				rpc,
				planId: `${pro1500.id}_${ladderPlan.idSuffix}`,
			});
		}

		const baseProduct = await getFullProduct({ ctx, planId: pro1500.id });
		expectProLadderPlanCorrect({
			plan: await getApiPlan({ ctx, planId: pro1500.id }),
			included: 1_500,
			basePrice: 49,
			overagePrice: 0.09,
		});

		for (const ladderPlan of ladderPlans) {
			const variantId = `${pro1500.id}_${ladderPlan.idSuffix}`;

			await rpc.post("/plans.create_variant", {
				base_plan_id: pro1500.id,
				variant_plan_id: variantId,
				name: ladderPlan.name,
			});
			await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
				price: {
					amount: ladderPlan.basePrice,
					interval: BillingInterval.Month,
				},
				items: apiPlanItems({
					included: ladderPlan.included,
					overagePrice: ladderPlan.overagePrice,
				}),
				disable_version: true,
			});

			const variantProduct = await getFullProduct({ ctx, planId: variantId });
			expectVariantProductCorrect({
				base: baseProduct,
				variant: variantProduct,
			});
			expectProLadderPlanCorrect({
				plan: await getApiPlan({ ctx, planId: variantId }),
				included: ladderPlan.included,
				basePrice: ladderPlan.basePrice,
				overagePrice: ladderPlan.overagePrice,
			});
		}
	},
	20_000,
);
