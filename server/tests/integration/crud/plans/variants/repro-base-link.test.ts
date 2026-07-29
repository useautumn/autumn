import { beforeAll, expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	type CreatePlanParamsV2Input,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature, getFeatures } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });
const { db, org, env } = ctx;

beforeAll(async () => {
	const desiredFeatures = Object.values(getFeatures({ orgId: org.id }));
	const existing = await FeatureService.list({ db, orgId: org.id, env });
	const existingIds = new Set(existing.map((f) => f.id));
	const missing = desiredFeatures.filter((f) => !existingIds.has(f.id));
	if (missing.length > 0) {
		await FeatureService.insert({ db, data: missing, logger: console });
	}
	ctx.features = await FeatureService.list({ db, orgId: org.id, env });
});

const msgItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test(
	`${chalk.yellowBright("repro: dashboard-style full-body base link via V1 products route")}`,
	async () => {
		const baseId = "repro_base";
		const planId = "repro_plan";
		await autumnRpc.plans
			.create<ApiPlanV1, CreatePlanParamsV2Input>({
				plan_id: baseId,
				name: `Base ${baseId}`,
				auto_enable: false,
				items: [msgItem(100)],
			})
			.catch(() => undefined);
		await autumnRpc.plans
			.create<ApiPlanV1, CreatePlanParamsV2Input>({
				plan_id: planId,
				name: `Plan ${planId}`,
				auto_enable: false,
				items: [msgItem(50)],
			})
			.catch(() => undefined);

		// Mimic the dashboard SaveChangesBar -> updateProduct util body
		const res = await autumnV1_2.products.update<ApiPlanV1>(planId, {
			id: planId,
			name: `Plan ${planId}`,
			items: [msgItem(50)],
			free_trial: null,
			config: { ignore_past_due: false },
			billing_controls: {},
			metadata: {},
			base_plan_id: baseId,
		});

		console.log("RESULT", JSON.stringify(res));

		const linked = await ProductService.getFull({
			db,
			idOrInternalId: planId,
			orgId: org.id,
			env,
		});
		const base = await ProductService.getFull({
			db,
			idOrInternalId: baseId,
			orgId: org.id,
			env,
		});
		expect(linked.base_internal_product_id).toBe(base.internal_id);
	},
);
