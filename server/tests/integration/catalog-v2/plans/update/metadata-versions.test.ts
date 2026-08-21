/**
 * catalogV2.update — plan metadata is one value shared across every version row.
 *
 * Red (current): in-place / new_version / pinned metadata writes leave older rows stale.
 * Green (after): every version row of the plan holds the new metadata.
 */

import { expect, test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const getPlanMetadata = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	return product.metadata;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 metadata: metadata update fans out to every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mv_fan");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Meta Fan",
						metadata: { tier: "old" },
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						price: { amount: 30, interval: BillingInterval.Month },
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, metadata: { tier: "new" } }],
			});

			expect(await getPlanMetadata({ ctx, planId, version: 1 })).toEqual({
				tier: "new",
			});
			expect(await getPlanMetadata({ ctx, planId, version: 2 })).toEqual({
				tier: "new",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 metadata: new_version mint with metadata updates older versions")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mv_mint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Meta Mint",
						metadata: { tier: "a" },
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						price: { amount: 30, interval: BillingInterval.Month },
						metadata: { tier: "b" },
					},
				],
			});

			expect(await getPlanMetadata({ ctx, planId, version: 1 })).toEqual({
				tier: "b",
			});
			expect(await getPlanMetadata({ ctx, planId, version: 2 })).toEqual({
				tier: "b",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 metadata: mint without metadata carries it; name update leaves it alone")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mv_carry");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Meta Carry",
						metadata: { tier: "a" },
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						price: { amount: 30, interval: BillingInterval.Month },
					},
				],
			});

			expect(await getPlanMetadata({ ctx, planId, version: 2 })).toEqual({
				tier: "a",
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Meta Carry Renamed" }],
			});

			expect(await getPlanMetadata({ ctx, planId, version: 1 })).toEqual({
				tier: "a",
			});
			expect(await getPlanMetadata({ ctx, planId, version: 2 })).toEqual({
				tier: "a",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 metadata: pinned version metadata update fans out")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mv_pin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Meta Pin",
						metadata: { tier: "old" },
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						price: { amount: 30, interval: BillingInterval.Month },
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 1,
						metadata: { tier: "pinned" },
					},
				],
			});

			expect(await getPlanMetadata({ ctx, planId, version: 1 })).toEqual({
				tier: "pinned",
			});
			expect(await getPlanMetadata({ ctx, planId, version: 2 })).toEqual({
				tier: "pinned",
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
