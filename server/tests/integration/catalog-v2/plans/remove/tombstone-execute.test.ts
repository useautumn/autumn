/**
 * Pin-remove of an expired-only non-live version tombstones that row.
 * Unpinned remove of expired-only versions tombstones the family; the plan
 * id is then a create (next free version), not an update.
 */

import { CusProductStatus } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import { expect, test } from "bun:test";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { expectTombstoneCorrect } from "../utils/expectTombstoneCorrect.js";
import { expectVersionIdentityCorrect } from "../utils/expectVersionIdentity.js";

const seedV1AndDraftV2 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: planId, name: "V1" }],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				versioning: "new_version",
				name: "V2 Draft",
			},
		],
	});
};

const findVersion = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) => {
	const versions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
		includeDeleted: true,
		skipCache: true,
	});
	const row = versions.find((product) => product.version === version);
	expect(row, `missing ${planId} v${version}`).toBeDefined();
	return row!;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove: pin expired-only draft tombstones that version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_tomb_pin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });
			const draft = await findVersion({ ctx, planId, version: 2 });
			const { cusProductId } = await seedVersionableCustomer({
				ctx,
				planId,
				version: 2,
				status: CusProductStatus.Expired,
			});

			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: planId, version: 2 }],
			});

			await expectTombstoneCorrect({
				ctx,
				autumn: autumnV2_3,
				planId,
				version: 2,
				previousVersionSlug: draft.version_slug ?? "v2",
				internalId: draft.internal_id,
				customerProductId: cusProductId,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: true,
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove: tombstone all versions then same id is create")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_tomb_all");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "V1" }],
			});
			const live = await findVersion({ ctx, planId, version: 1 });
			const { cusProductId } = await seedVersionableCustomer({
				ctx,
				planId,
				version: 1,
				status: CusProductStatus.Expired,
			});

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_plans: [{ plan_id: planId }],
				}),
				plans: [
					{
						planId,
						action: "delete",
						willArchive: false,
						hasCustomers: true,
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: planId }],
			});
			await expectTombstoneCorrect({
				ctx,
				autumn: autumnV2_3,
				planId,
				version: 1,
				previousVersionSlug: live.version_slug ?? "v1",
				internalId: live.internal_id,
				customerProductId: cusProductId,
			});

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, name: "Reborn" }],
				}),
				plans: [{ planId, action: "create", version: 2 }],
			});
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, name: "Reborn" }],
				}),
				plans: [{ id: planId, action: "create" }],
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "v2",
				active: true,
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
