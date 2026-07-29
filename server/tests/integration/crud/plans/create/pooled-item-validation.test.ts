import { test } from "bun:test";
import {
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	ErrCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const expectPooledItemRejected = async ({
	planId,
	item,
	errMessage = "Pooled items are only supported for metered features",
}: {
	planId: string;
	item: NonNullable<CreatePlanParamsV2Input["items"]>[number];
	errMessage?: string;
}) => {
	await expectAutumnError({
		errCode: ErrCode.InvalidProductItem,
		errMessage,
		func: () =>
			autumnRpc.plans.create<unknown, CreatePlanParamsV2Input>({
				plan_id: planId,
				name: planId,
				group: `group-${planId}`,
				auto_enable: false,
				items: [item],
			}),
	});
};

test.concurrent(
	"pooled item validation: accepts unpriced boolean features",
	async () => {
		const planId = `pooled-boolean-${crypto.randomUUID()}`;
		await autumnRpc.plans.create<unknown, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: planId,
			group: `group-${planId}`,
			auto_enable: false,
			items: [{ ...itemsV2.dashboard(), pooled: true }],
		});
	},
);

test.concurrent(
	"pooled item validation: rejects priced boolean features",
	async () => {
		await expectPooledItemRejected({
			planId: `pooled-priced-boolean-${crypto.randomUUID()}`,
			item: {
				...itemsV2.dashboard(),
				pooled: true,
				price: {
					amount: 10,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
			errMessage:
				"Pooled boolean items cannot include balance or pricing fields",
		});
	},
);

test.concurrent(
	"pooled item validation: rejects boolean balance configuration",
	async () => {
		await expectPooledItemRejected({
			planId: `pooled-configured-boolean-${crypto.randomUUID()}`,
			item: {
				...itemsV2.dashboard(),
				pooled: true,
				included: 1,
			},
			errMessage:
				"Pooled boolean items cannot include balance or pricing fields",
		});
	},
);

test.concurrent(
	"pooled item validation: accepts unlimited metered features",
	async () => {
		const planId = `pooled-unlimited-${crypto.randomUUID()}`;
		await autumnRpc.plans.create<unknown, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: planId,
			group: `group-${planId}`,
			auto_enable: false,
			items: [
				{
					feature_id: TestFeature.Messages,
					unlimited: true,
					pooled: true,
				},
			],
		});
	},
);

test.concurrent(
	"pooled item validation: rejects priced unlimited features",
	async () => {
		await expectPooledItemRejected({
			planId: `pooled-priced-unlimited-${crypto.randomUUID()}`,
			item: {
				feature_id: TestFeature.Messages,
				unlimited: true,
				pooled: true,
				price: {
					amount: 10,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
			errMessage: "Pooled unlimited items cannot include pricing",
		});
	},
);

test.concurrent(
	"pooled item validation: rejects pay-per-use feature pricing",
	async () => {
		await expectPooledItemRejected({
			planId: `pooled-pay-per-use-${crypto.randomUUID()}`,
			item: { ...itemsV2.consumableMessages(), pooled: true },
			errMessage: "Pooled items cannot use usage-based pricing",
		});
	},
);
