import { expect, test } from "bun:test";
import { ApiVersion, BillingInterval, type CreatePlanParamsInput } from "@autumn/shared";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

test.concurrent(`${chalk.yellowBright("rpc delete: create then delete plan successfully")}`, async () => {
	const productId = `rpc_delete_${getSuffix()}`;
	const group = `rpc_group_${productId}`;

	try {
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<any, CreatePlanParamsInput>({
		id: productId,
		name: "RPC Delete Test",
		group,
		auto_enable: false,
		price: {
			amount: 1900,
			interval: BillingInterval.Month,
		},
	});

	const beforeDelete = await autumnRpc.plans.get<any>(productId);
	expect(beforeDelete.id).toBe(productId);

	const deleteResult = await autumnRpc.plans.delete(productId, {
		allVersions: false,
	});
	expect(deleteResult.success).toBe(true);

	let err: any = null;
	try {
		await autumnRpc.plans.get(productId);
	} catch (error) {
		err = error;
	}

	expect(err).toBeDefined();
});
