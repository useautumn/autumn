import { expect, test } from "bun:test";
import { type ApiPlanExpandedV1, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
});

const getPlan = async ({
	autumn,
	planId,
}: {
	autumn: AutumnInt;
	planId: string;
}): Promise<ApiPlanExpandedV1> => {
	const catalog = await autumn.catalogV2.get({});
	const plan = catalog.plans.find((row: { id: string }) => row.id === planId);
	expect(plan, `GET catalog plan ${planId}`).toBeDefined();
	return plan!;
};

const versionRow = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) =>
	ProductService.get({
		db: ctx.db,
		id: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const seedTwoVersions = async ({
	autumn,
	planId,
}: {
	autumn: AutumnInt;
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{ plan_id: planId, name: "Internal Id", items: [messagesItem(100)] },
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				items: [messagesItem(200)],
				versioning: "new_version",
				active: true,
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: GET echoes it, and it addresses the row it names")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_iid_addr");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await seedTwoVersions({ autumn: autumnV2_3, planId });

				const plan = await getPlan({ autumn: autumnV2_3, planId });
				expect(plan.internal_id, "plan internal_id echoed").toMatch(/^prod_/);

				const v1 = await versionRow({ ctx, planId, version: 1 });
				expect(v1?.internal_id, "v1 has an internal id").toBeDefined();

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							internal_id: v1!.internal_id,
							name: "Renamed V1 Only",
						},
					],
				});

				expect(
					(await versionRow({ ctx, planId, version: 1 }))?.name,
					"addressed row changed",
				).toBe("Renamed V1 Only");
				expect(
					(await versionRow({ ctx, planId, version: 2 }))?.name,
					"active row untouched",
				).toBe("Internal Id");
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: a differing plan_id on a known id is a rename")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_iid_rename");
		const renamedId = `${planId}_renamed`;

		await withCatalogPlans({
			ctx,
			planIds: [planId, renamedId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, name: "Before", items: [messagesItem(100)] },
					],
				});
				const before = await versionRow({ ctx, planId, version: 1 });
				const internalId = before!.internal_id;

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: renamedId,
							internal_id: internalId,
							name: "After",
							items: [messagesItem(100)],
						},
					],
				});

				const renamed = await versionRow({
					ctx,
					planId: renamedId,
					version: 1,
				});
				expect(renamed?.internal_id, "same row, new id").toBe(internalId);
				expect(renamed?.name, "content applied").toBe("After");

				const viaOldId = await ProductService.getFull({
					db: ctx.db,
					idOrInternalId: internalId,
					orgId: ctx.org.id,
					env: ctx.env,
					allowNotFound: true,
				});
				expect(viaOldId?.id, "row now answers to the new id").toBe(renamedId);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: a differing version_slug on a known id is a slug rename")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_iid_reslug");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, name: "Before", items: [messagesItem(100)] },
					],
				});
				const before = await versionRow({ ctx, planId, version: 1 });
				const internalId = before!.internal_id;
				expect(before?.version_slug).toBe("v1");

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							internal_id: internalId,
							version_slug: "legacy",
							name: "Before",
							items: [messagesItem(100)],
						},
					],
				});

				const reslugged = await versionRow({ ctx, planId, version: 1 });
				expect(reslugged?.internal_id, "same row").toBe(internalId);
				expect(reslugged?.version_slug, "slug renamed").toBe("legacy");
				expect(
					(
						await ProductService.listFull({
							db: ctx.db,
							orgId: ctx.org.id,
							env: ctx.env,
							inIds: [planId],
						})
					).length,
					"no second row minted under the new slug",
				).toBe(1);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: renaming one version of a plan away from its family is rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_iid_split");
		const renamedId = `${planId}_renamed`;

		await withCatalogPlans({
			ctx,
			planIds: [planId, renamedId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, name: "Plan", items: [messagesItem(100)] },
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							versioning: "new_version",
							items: [messagesItem(200)],
						},
					],
				});
				const v1 = await versionRow({ ctx, planId, version: 1 });
				const v2 = await versionRow({ ctx, planId, version: 2 });

				const splitMessage = `All versions of ${planId} must keep one plan id. Rename every version to ${renamedId}, or none.`;
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: splitMessage,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: planId,
									internal_id: v1!.internal_id,
									name: "Plan",
									items: [messagesItem(100)],
								},
								{
									plan_id: renamedId,
									internal_id: v2!.internal_id,
									name: "Plan",
									items: [messagesItem(200)],
								},
							],
						}),
				});

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: splitMessage,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: renamedId,
									internal_id: v2!.internal_id,
									name: "Plan",
									items: [messagesItem(200)],
								},
							],
						}),
				});

				expect((await versionRow({ ctx, planId, version: 2 }))?.id).toBe(
					planId,
				);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: renamedId,
							internal_id: v1!.internal_id,
							name: "Plan",
							items: [messagesItem(100)],
						},
						{
							plan_id: renamedId,
							internal_id: v2!.internal_id,
							name: "Plan",
							items: [messagesItem(200)],
						},
					],
				});
				expect(
					(await versionRow({ ctx, planId: renamedId, version: 1 }))
						?.internal_id,
				).toBe(v1!.internal_id);
				expect(
					(await versionRow({ ctx, planId: renamedId, version: 2 }))
						?.internal_id,
				).toBe(v2!.internal_id);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: composite still resolves, conflicts and unknowns are rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_iid_guard");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Guarded",
							items: [messagesItem(100)],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							items: [messagesItem(200)],
							versioning: "new_version",
							new_version_slug: "v2",
							active: true,
						},
					],
				});
				const v1 = await versionRow({ ctx, planId, version: 1 });

				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, version_slug: "v1", name: "Via Slug" }],
				});
				expect(
					(await versionRow({ ctx, planId, version: 1 }))?.name,
					"composite fallback still works",
				).toBe("Via Slug");

				const conflicting = autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							internal_id: v1!.internal_id,
							version_slug: "v2",
							name: "Ambiguous",
						},
					],
				});
				await expect(conflicting).rejects.toThrow();

				const ghostId = `${planId}_ghost`;
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: ghostId,
							internal_id: "prod_nothingownsthisid",
							name: "Ghost",
						},
					],
				});
				const ghost = (await autumnV2_3.catalogV2.get({})) as unknown as {
					plans: { id: string }[];
				};
				expect(ghost.plans.some((row) => row.id === ghostId)).toBe(true);
			},
		});
	},
);
