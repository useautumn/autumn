/**
 * Version identity — legacy plans.update omit-version vs force_version (r6).
 *
 * Contract under test:
 *   r6a  v1+v2, v2 active → omit plans.update patches v2
 *   r6b  v1 forced active → omit plans.update patches v1
 *   r6c  v1 forced active, v2 exists → force_version clones v1 into max+1 (v3)
 */

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
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { ProductService } from "@/internal/products/ProductService.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;
type TestContext = Awaited<ReturnType<typeof initScenario>>["ctx"];
type FullProductRow = Awaited<ReturnType<typeof ProductService.listFull>>[number];

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

const allowanceFor = ({ product }: { product: FullProductRow }) =>
	product.entitlements.find(
		(entitlement) => entitlement.feature_id === TestFeature.Messages,
	)?.allowance;

const setupVersionedPlan = async (testId: string) => {
	const base = products.base({
		id: `version_identity_legacy_${testId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx } = await initScenario({
		customerId: `version-identity-legacy-${testId}`,
		setup: [s.customer({}), s.products({ list: [base] })],
		actions: [],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: base.id,
				name: "V2",
				items: [monthlyMessagesItem(200)],
				versioning: "new_version",
			},
		],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	return { ctx, planId: base.id, rpc };
};

const listVersions = async ({
	ctx,
	planId,
}: {
	ctx: TestContext;
	planId: string;
}) =>
	ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
		skipCache: true,
	});

test.concurrent(
	`${chalk.yellowBright("version identity legacy r6a: omit plans.update with v2 active patches v2")}`,
	async () => {
		const { ctx, planId, rpc } = await setupVersionedPlan("lockstep");

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
			name: "V2 Edited",
		});

		const versions = await listVersions({ ctx, planId });
		const v1 = versions.find((product) => product.version === 1);
		const v2 = versions.find((product) => product.version === 2);
		expect(v1?.name).not.toBe("V2 Edited");
		expect(v2?.name).toBe("V2 Edited");
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity legacy r6b: omit plans.update with v1 forced active patches v1")}`,
	async () => {
		const { ctx, planId, rpc } = await setupVersionedPlan("omit");
		await forceActiveVersion({ ctx, planId, version: 1 });

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
			name: "V1 Edited",
		});

		const versions = await listVersions({ ctx, planId });
		const v1 = versions.find((product) => product.version === 1);
		const v2 = versions.find((product) => product.version === 2);
		expect(v1?.name).toBe("V1 Edited");
		expect(v2?.name).toBe("V2");
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity legacy r6c: force_version clones active v1 into max+1")}`,
	async () => {
		const { ctx, planId, rpc } = await setupVersionedPlan("force");
		await forceActiveVersion({ ctx, planId, version: 1 });

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
			name: "V3",
			force_version: true,
		});

		const versions = await listVersions({ ctx, planId });
		expect(versions.map((product) => product.version).sort()).toEqual([
			1, 2, 3,
		]);
		const v1 = versions.find((product) => product.version === 1)!;
		const v2 = versions.find((product) => product.version === 2)!;
		const v3 = versions.find((product) => product.version === 3)!;
		expect(v2.name).toBe("V2");
		expect(v3.name).toBe("V3");
		expect(allowanceFor({ product: v3 })).toBe(100);
		expect(v3.active).toBe(true);
		expect(v1.active).toBe(false);
		expect(v2.active).toBe(false);
	},
);
