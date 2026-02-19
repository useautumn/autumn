import { expect, test } from "bun:test";
import {
	type ApiPlan,
	ApiPlanV0Schema,
	type ApiPlanV1,
	ApiPlanV1Schema,
	type ApiProduct,
	ApiProductSchema,
	ApiVersion,
	type CreatePlanParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
const autumnV2_0 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });

const getSuffix = () => Math.random().toString(36).slice(2, 9);

test.concurrent(`${chalk.yellowBright("rpc regression: rest list stays cross-version compatible after rpc create")}`, async () => {
	const suffix = getSuffix();
	const freeId = `rpc_list_free_${suffix}`;
	const freeGroup = `rpc_list_group_free_${suffix}`;

	try {
		await autumnRpc.plans.delete(freeId, { allVersions: true });
	} catch (_error) {
		// no-op
	}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsInput>({
		id: freeId,
		name: "RPC List Free",
		group: freeGroup,
		items: [{ feature_id: TestFeature.Credits, included: 500 }],
	});

	const plansV2_1 = await autumnV2_1.products.list<ApiPlanV1[]>();
	const plansV2_0 = await autumnV2_0.products.list<ApiPlan[]>();
	const productsV1 = await autumnV1.products.list<ApiProduct[]>();

	for (const plan of plansV2_1.list) {
		ApiPlanV1Schema.parse(plan);
	}
	for (const plan of plansV2_0.list) {
		ApiPlanV0Schema.parse(plan);
	}
	for (const product of productsV1.list) {
		ApiProductSchema.parse(product);
	}

	expect(plansV2_1.list.some((plan) => plan.id === freeId)).toBe(true);
	expect(plansV2_0.list.some((plan) => plan.id === freeId)).toBe(true);
	expect(productsV1.list.some((product) => product.id === freeId)).toBe(true);
});
