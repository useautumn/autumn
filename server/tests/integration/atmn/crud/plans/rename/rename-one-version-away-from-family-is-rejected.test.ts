import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

const versionRows = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) =>
	(
		await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			inIds: [planId],
			returnAll: true,
		})
	).sort((a, b) => a.version - b.version);

const twoVersions = ({
	v1Id,
	v2Id,
	v1InternalId,
	v2InternalId,
}: {
	v1Id: string;
	v2Id: string;
	v1InternalId?: string;
	v2InternalId?: string;
}) => `{
	plans: [
		plan({ active: true, planId: "${v2Id}", versionSlug: "v2", name: "Pro"${v2InternalId ? `, internalId: "${v2InternalId}"` : ""}, price: { amount: 49, interval: "month" } }),
	
		plan({ active: false, planId: "${v1Id}", versionSlug: "v1", name: "Pro"${v1InternalId ? `, internalId: "${v1InternalId}"` : ""}, price: { amount: 39, interval: "month" } }),
	],
}`;

test.concurrent(
	`${chalk.yellowBright("rename one version away from its family: lint names the rename case, server rejects the split, full rename applies")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "v1", name: "Pro", price: { amount: 39, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();
			scenario.writeConfig(
				atmnConfigSource({ body: twoVersions({ v1Id: "pro", v2Id: "pro" }) }),
			);
			await scenario.push();
			const [v1, v2] = await versionRows({ ctx: scenario.ctx, planId: "pro" });

			scenario.writeConfig(
				atmnConfigSource({
					body: twoVersions({
						v1Id: "proNew",
						v2Id: "pro",
						v1InternalId: v1!.internal_id,
						v2InternalId: v2!.internal_id,
					}),
				}),
			);
			await expect(scenario.push({ dryRun: true })).rejects.toThrow(
				"If you are renaming a plan, change the planId on every one of its versions, not just some.",
			);

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "proNew", versionSlug: "v2", internalId: "${v2!.internal_id}", name: "Pro", price: { amount: 49, interval: "month" } }),
	],
}`,
				}),
			);
			await expect(scenario.push({ dryRun: true })).rejects.toThrow(
				"All versions of pro must keep one plan id. Rename every version to proNew, or none.",
			);
			expect(
				(await versionRows({ ctx: scenario.ctx, planId: "pro" })).map(
					(row) => row.internal_id,
				),
			).toEqual([v1!.internal_id, v2!.internal_id]);

			scenario.writeConfig(
				atmnConfigSource({
					body: twoVersions({
						v1Id: "proNew",
						v2Id: "proNew",
						v1InternalId: v1!.internal_id,
						v2InternalId: v2!.internal_id,
					}),
				}),
			);
			await expectRoundTrip({ scenario });
			expect(
				(await versionRows({ ctx: scenario.ctx, planId: "proNew" })).map(
					(row) => row.internal_id,
				),
			).toEqual([v1!.internal_id, v2!.internal_id]);
			expect(await versionRows({ ctx: scenario.ctx, planId: "pro" })).toEqual(
				[],
			);
		} finally {
			scenario.cleanup();
		}
	},
);
