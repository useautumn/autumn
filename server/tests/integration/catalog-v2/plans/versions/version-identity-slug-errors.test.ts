/**
 * catalogV2 version identity — targeting validation (unit 3).
 *
 * Contract:
 *   version + version_slug together → 400 (even if they agree)
 *   unknown version_slug → mints under that slug (reversed 2026-08-31)
 *   all_versions / new_version + slug pin → 400 (same as numeric pin)
 *   duplicate same slug twice → 400 InvalidRequest
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const seedV1 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: planId, name: "V1" }],
	});
};

test.concurrent(
	`${chalk.yellowBright("version identity slug-errors: both version and version_slug → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_eboth");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1({ autumn: autumnV2_3, planId });
			await expectAutumnError({
				errMessage: "Cannot specify both version and version_slug",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								version: 1,
								version_slug: "v1",
								name: "Agree",
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity slug-errors: unknown version_slug mints under that name")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_eunk");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1({ autumn: autumnV2_3, planId });

			// Reversed deliberately: this was a 400. Under a config that states the
			// whole desired history, a slug naming no row is history the catalog
			// does not have yet, so it is minted rather than rejected. The
			// guarantee that matters — it must never land on the active row —
			// still holds, and preview is what surfaces an accidental mint.
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "missing", name: "Ghost" }],
			});

			const minted = await ProductService.get({
				db: ctx.db,
				id: planId,
				orgId: ctx.org.id,
				env: ctx.env,
				version: 2,
			});
			expect(minted?.version_slug, "minted under the stated slug").toBe(
				"missing",
			);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity slug-errors: strategy+slug pin and duplicate slug")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const allId = uniqueTestId("cv2_vid_eall");
		const mintId = uniqueTestId("cv2_vid_emint");
		const dupId = uniqueTestId("cv2_vid_edup");
		await deleteDbPlans({ ctx, planIds: [allId, mintId, dupId] });
		try {
			await seedV1({ autumn: autumnV2_3, planId: allId });
			await seedV1({ autumn: autumnV2_3, planId: mintId });
			await seedV1({ autumn: autumnV2_3, planId: dupId });

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage:
					'versioning "all_versions" cannot be combined with an explicit version',
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: allId,
								version_slug: "v1",
								versioning: "all_versions",
								name: "Propagate",
							},
						],
					}),
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage:
					'versioning "new_version" cannot be combined with an explicit version',
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: mintId,
								version_slug: "v1",
								versioning: "new_version",
								name: "Mint",
							},
						],
					}),
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: `Duplicate plan entry for plan_id=${dupId} version=1`,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: dupId, version_slug: "v1", name: "A" },
							{ plan_id: dupId, version_slug: "v1", name: "B" },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [allId, mintId, dupId] });
		}
	},
);
