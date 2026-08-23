/**
 * Version identity dual-write (plan-version-identity unit 1).
 *
 * Contract under test:
 *   New columns on products (not yet exposed in API responses):
 *     - version_slug: string — user-facing version identity, defaults to `v{n}`
 *     - active: boolean — at most one active version per plan (DB-enforced)
 *   New behaviors (write paths only; nothing reads these yet):
 *     - plan create → v1 row carries version_slug "v1", active true
 *     - legacy version mint (plans.update force_version) → new row gets a
 *       FRESH slug "v{n}" (not the cloned source slug) and becomes active;
 *       the previous version is deactivated, its slug untouched
 *     - catalogV2 new_version mint → same invariants through the
 *       initProductRow clone path
 *   Side effects: products rows only — asserted via ProductService, not API.
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
import { ProductService } from "@/internal/products/ProductService.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;
type TestContext = Awaited<ReturnType<typeof initScenario>>["ctx"];

const monthlyMessagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

/** Fetch one version row and assert its version identity columns. */
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

		// The mint clones the previous row — the slug must be freshly minted
		// ("v2"), never the cloned "v1" (unique_product_version_slug).
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
