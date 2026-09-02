/**
 * catalogV2 preview/update — claiming a reserved plan-id alias.
 *
 * After pro → proNew, pro aliases proNew. Catalog preview surfaces
 * alias_replacement and execute deletes that alias so pro is a real id
 * again. REST create stays 400. Own-reclaim includes the field (alias dies).
 *
 * Create-claim calls the catalog action directly: public ingress rewrites
 * plan_id to the owner; dashboard skips rewrite (secret-key tests cannot).
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	type AttachParamsV1Input,
	customerProducts,
	ErrCode,
	products,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { catalogV2Actions } from "@/internal/catalogV2/actions/index.js";
import { buildUpdateCatalogPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/buildUpdateCatalogPreview.js";
import { toPlanAliasMap } from "@/internal/catalogV2/productAliases/toPlanAliasMap.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../preview/utils/expectPlanPreview.js";
import {
	deleteDbPlans,
	expectDbPlansAbsent,
} from "../utils/expectCatalogPlans.js";
import {
	deleteAliases,
	listAliases,
	renamePlan,
} from "../utils/planAliasTestUtils.js";
import { cleanupRefs, seedCustomerProductRef } from "../utils/seedPlanRefs.js";

const replacement = ({
	aliasId,
	ownerId,
}: {
	aliasId: string;
	ownerId: string;
}) => ({ alias_id: aliasId, plan_id: ownerId });

const seedReservedAlias = async ({
	autumn,
	aliasId,
	ownerId,
	name,
}: {
	autumn: AutumnInt;
	aliasId: string;
	ownerId: string;
	name: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: aliasId, name }],
	});
	await renamePlan({ autumn, fromId: aliasId, toId: ownerId });
};

/** Dashboard skips ingress rewrite; secret-key tests cannot send that header. */
const syncPlanAliasesOnCtx = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	const rows = await listAliases({ ctx, planIds });
	ctx.org.planAliases = toPlanAliasMap({ rows });
};

const previewCreateClaim = async ({
	ctx,
	planId,
	name,
	planIds,
}: {
	ctx: AutumnContext;
	planId: string;
	name: string;
	planIds: string[];
}) => {
	await syncPlanAliasesOnCtx({ ctx, planIds });
	const params = {
		features: [],
		remove_features: [],
		plans: [{ plan_id: planId, name }],
		remove_plans: [],
		skip_deletions: true,
		skip_plan_ids: [],
		skip_feature_ids: [],
	};
	const { catalogContext, updateCatalogPlan } =
		await catalogV2Actions.updateCatalog({
			ctx,
			params,
			preview: true,
		});
	return parsePlanPreview(
		buildUpdateCatalogPreview({ catalogContext, updateCatalogPlan }),
	);
};

const executeCreateClaim = async ({
	ctx,
	planId,
	name,
	planIds,
}: {
	ctx: AutumnContext;
	planId: string;
	name: string;
	planIds: string[];
}) => {
	await syncPlanAliasesOnCtx({ ctx, planIds });
	await catalogV2Actions.updateCatalog({
		ctx,
		params: {
			features: [],
			remove_features: [],
			plans: [{ plan_id: planId, name }],
			remove_plans: [],
			skip_deletions: true,
			skip_plan_ids: [],
			skip_feature_ids: [],
		},
	});
};

const getPlanRows = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) =>
	ctx.db
		.select()
		.from(products)
		.where(
			and(
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
				eq(products.id, planId),
			),
		);

test.concurrent(
	`${chalk.yellowBright("catalogV2 alias replacement: preview field on create / rename / variant / reclaim; absent otherwise")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const aliasId = uniqueTestId("cv2_ar_prev");
		const ownerId = uniqueTestId("cv2_ar_prev_own");
		const starterId = uniqueTestId("cv2_ar_prev_st");
		const baseId = uniqueTestId("cv2_ar_prev_base");
		const variantId = uniqueTestId("cv2_ar_prev_eu");
		const cleanId = uniqueTestId("cv2_ar_prev_ok");
		const planIds = [aliasId, ownerId, starterId, baseId, variantId, cleanId];
		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await seedReservedAlias({
				autumn: autumnV2_3,
				aliasId,
				ownerId,
				name: "Occupied",
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: starterId, name: "Starter" },
					{ plan_id: baseId, name: "Team" },
					{ plan_id: cleanId, name: "Clean" },
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			});

			// Create-claim bypasses HTTP ingress (dashboard does the same).
			const createPreview = await previewCreateClaim({
				ctx,
				planId: aliasId,
				name: "Claimed Create",
				planIds,
			});
			expectPlanPreviewRowCorrect({
				preview: createPreview,
				expected: {
					planId: aliasId,
					action: "create",
					aliasReplacement: replacement({ aliasId, ownerId }),
				},
			});
			await expectDbPlansAbsent({ ctx, planIds: [aliasId] });

			const renamePreview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: starterId, new_plan_id: aliasId }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: renamePreview,
				expected: {
					planId: starterId,
					action: "update",
					aliasReplacement: replacement({ aliasId, ownerId }),
				},
			});

			const variantPreview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							variants: [{ variant_plan_id: variantId, new_plan_id: aliasId }],
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: variantPreview,
				expected: {
					planId: baseId,
					aliasReplacement: null,
					variants: [
						{
							planId: variantId,
							aliasReplacement: replacement({ aliasId, ownerId }),
						},
					],
				},
			});

			const reclaimPreview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: ownerId, new_plan_id: aliasId }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: reclaimPreview,
				expected: {
					planId: ownerId,
					action: "update",
					aliasReplacement: replacement({ aliasId, ownerId }),
				},
			});

			const cleanPreview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: cleanId, name: "Still Clean" }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: cleanPreview,
				expected: {
					planId: cleanId,
					action: "update",
					aliasReplacement: null,
				},
			});
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 alias replacement: execute create / rename / variant new_plan_id claims alias")}`,
	async () => {
		const { autumnV2_3, ctx, customerId } = await initScenario({
			customerId: uniqueTestId("cv2_ar_ex"),
			setup: [s.customer()],
			actions: [],
		});
		const createAlias = uniqueTestId("cv2_ar_ex_c");
		const createOwner = uniqueTestId("cv2_ar_ex_c_own");
		const starterId = uniqueTestId("cv2_ar_ex_st");
		const starterAlias = uniqueTestId("cv2_ar_ex_st_a");
		const starterOwner = uniqueTestId("cv2_ar_ex_st_own");
		const baseId = uniqueTestId("cv2_ar_ex_base");
		const variantId = uniqueTestId("cv2_ar_ex_eu");
		const variantAlias = uniqueTestId("cv2_ar_ex_eu_a");
		const variantOwner = uniqueTestId("cv2_ar_ex_eu_own");
		const planIds = [
			createAlias,
			createOwner,
			starterId,
			starterAlias,
			starterOwner,
			baseId,
			variantId,
			variantAlias,
			variantOwner,
		];
		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		let cusProductId: string | undefined;
		try {
			await seedReservedAlias({
				autumn: autumnV2_3,
				aliasId: createAlias,
				ownerId: createOwner,
				name: "Create Occupied",
			});
			await executeCreateClaim({
				ctx,
				planId: createAlias,
				name: "Claimed Create",
				planIds,
			});

			const afterCreate = await listAliases({
				ctx,
				planIds: [createAlias, createOwner],
			});
			expect(afterCreate.some((row) => row.alias_id === createAlias)).toBe(
				false,
			);
			const created = await autumnV2_3.products.get<ApiPlanV1>(createAlias);
			expect(created.id).toBe(createAlias);
			expect(created.name).toBe("Claimed Create");
			const createOwnerPlan =
				await autumnV2_3.products.get<ApiPlanV1>(createOwner);
			expect(createOwnerPlan.id).toBe(createOwner);

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: createAlias,
			});
			await expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				active: [createAlias],
			});

			await seedReservedAlias({
				autumn: autumnV2_3,
				aliasId: starterAlias,
				ownerId: starterOwner,
				name: "Rename Occupied",
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: starterId, name: "Starter" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: starterId, new_plan_id: starterAlias }],
			});

			const afterRename = await listAliases({
				ctx,
				planIds: [starterId, starterAlias, starterOwner],
			});
			expect(afterRename.some((row) => row.alias_id === starterAlias)).toBe(
				false,
			);
			expect(
				afterRename.some(
					(row) =>
						row.alias_id === starterId &&
						row.canonical_plan_id === starterAlias,
				),
			).toBe(true);
			const renamed = await autumnV2_3.products.get<ApiPlanV1>(starterAlias);
			expect(renamed.id).toBe(starterAlias);
			expect(renamed.name).toBe("Starter");
			const starterOwnerPlan =
				await autumnV2_3.products.get<ApiPlanV1>(starterOwner);
			expect(starterOwnerPlan.id).toBe(starterOwner);

			await seedReservedAlias({
				autumn: autumnV2_3,
				aliasId: variantAlias,
				ownerId: variantOwner,
				name: "Variant Occupied",
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, name: "Team" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			});
			({ cusProductId } = await seedCustomerProductRef({
				ctx,
				planId: variantId,
			}));

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{ variant_plan_id: variantId, new_plan_id: variantAlias },
						],
					},
				],
			});

			expect(await getPlanRows({ ctx, planId: variantId })).toHaveLength(0);
			const variantRows = await getPlanRows({ ctx, planId: variantAlias });
			expect(variantRows).toHaveLength(1);
			const afterVariant = await listAliases({
				ctx,
				planIds: [variantId, variantAlias, variantOwner],
			});
			expect(afterVariant.some((row) => row.alias_id === variantAlias)).toBe(
				false,
			);
			expect(
				afterVariant.some(
					(row) =>
						row.alias_id === variantId &&
						row.canonical_plan_id === variantAlias,
				),
			).toBe(true);
			const [cusProduct] = await ctx.db
				.select()
				.from(customerProducts)
				.where(eq(customerProducts.id, cusProductId));
			expect(cusProduct.product_id).toBe(variantId);
			expect(cusProduct.internal_product_id).toBe(variantRows[0]?.internal_id);
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await cleanupRefs({ ctx, planIds });
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 alias replacement: new_version rename claims reserved alias")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const aliasId = uniqueTestId("cv2_ar_nv");
		const ownerId = uniqueTestId("cv2_ar_nv_own");
		const starterId = uniqueTestId("cv2_ar_nv_st");
		const planIds = [aliasId, ownerId, starterId];
		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await seedReservedAlias({
				autumn: autumnV2_3,
				aliasId,
				ownerId,
				name: "Occupied",
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: starterId, name: "Starter" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: starterId,
						new_plan_id: aliasId,
						versioning: "new_version",
					},
				],
			});
			const afterClaim = await listAliases({ ctx, planIds });
			expect(afterClaim.some((row) => row.alias_id === aliasId)).toBe(false);
			const claimed = await autumnV2_3.products.get<ApiPlanV1>(aliasId);
			expect(claimed.id).toBe(aliasId);
			expect(claimed.name).toBe("Starter");
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 alias replacement: REST create of reserved id still 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const aliasId = uniqueTestId("cv2_ar_rest");
		const ownerId = uniqueTestId("cv2_ar_rest_own");
		const planIds = [aliasId, ownerId];
		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await seedReservedAlias({
				autumn: autumnV2_3,
				aliasId,
				ownerId,
				name: "Rest Occupied",
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "reserved as an alias",
				func: () =>
					autumnV2_3.products.create({
						id: aliasId,
						name: "Should Not Create",
					}),
			});
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
