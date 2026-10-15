/**
 * Admin catalog export → catalogV2 import, on the legacy shape a real org
 * carries (seedExportedCatalog).
 *
 * Contract:
 *   E1  same org: previewing the export changes nothing
 *   E2  fresh org: the export previews, applies, and re-exports identically
 *   E3  top-level base_variant_id may name a plan created later in the request
 */

import { expect, test } from "bun:test";
import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { messagesItem } from "../licenses/utils/seedLicensePlans.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { expectVariantPointerCorrect } from "../variants/utils/expectVariantPointer.js";
import {
	type ExportedCatalogPlanIds,
	exportCatalogPlans,
	renamePlanIds,
	seedExportedCatalog,
} from "./utils/seedExportedCatalog.js";

const planIdsFor = (prefix: string): ExportedCatalogPlanIds => ({
	monthly: uniqueTestId(`${prefix}_monthly`),
	annual: uniqueTestId(`${prefix}_annual`),
	team: uniqueTestId(`${prefix}_team`),
	teamAnnual: uniqueTestId(`${prefix}_team_annual`),
});

/** Plan rows that aren't `none`, plus nested variants carrying a plan_change. */
const changedRows = ({ preview }: { preview: PreviewUpdateCatalogResponse }) =>
	preview.plans.flatMap((row) => [
		...(row.action === "none" ? [] : [`${row.plan_id}@${row.version_slug}`]),
		...(row.variants ?? [])
			.filter((variant) => variant.plan_change)
			.map((variant) => `${variant.plan_id}@${variant.version_slug}`),
	]);

test.concurrent(
	`${chalk.yellowBright("catalog export E1: same-org preview of the export changes nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const ids = planIdsFor("cv2_exp_same");
		await deleteDbPlans({ ctx, planIds: Object.values(ids) });
		try {
			await seedExportedCatalog({ autumn: autumnV2_3, ctx, ids });
			const plans = await exportCatalogPlans({ autumn: autumnV2_3, ids });

			const preview = await autumnV2_3.catalogV2.previewUpdate({ plans });

			expect(changedRows({ preview })).toEqual([]);
		} finally {
			await deleteDbPlans({ ctx, planIds: Object.values(ids) });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog export E2: fresh-org import previews, applies and re-exports identically")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const source = planIdsFor("cv2_exp_src");
		const target = planIdsFor("cv2_exp_dst");
		const planIds = [...Object.values(source), ...Object.values(target)];
		await deleteDbPlans({ ctx, planIds });
		try {
			await seedExportedCatalog({ autumn: autumnV2_3, ctx, ids: source });
			const plans = renamePlanIds({
				value: await exportCatalogPlans({ autumn: autumnV2_3, ids: source }),
				renames: Object.fromEntries(
					Object.entries(source).map(([key, id]) => [
						id,
						target[key as keyof ExportedCatalogPlanIds],
					]),
				),
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({ plans });
			const createdPlanIds = preview.plans
				.filter((row) => row.action === "create")
				.map((row) => row.plan_id);
			expect(new Set(createdPlanIds)).toEqual(
				new Set([target.annual, target.monthly, target.team]),
			);

			await autumnV2_3.catalogV2.update({ plans });

			expect(
				await exportCatalogPlans({ autumn: autumnV2_3, ids: target }),
			).toEqual(plans);
			const replay = await autumnV2_3.catalogV2.previewUpdate({ plans });
			expect(changedRows({ preview: replay })).toEqual([]);
		} finally {
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog export E3: base_variant_id resolves a base stated later in the same request")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_exp_fwd_base");
		const variantId = uniqueTestId("cv2_exp_fwd_variant");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: variantId,
						name: "Variant",
						base_variant_id: baseId,
						items: [messagesItem(50)],
					},
					{ plan_id: baseId, name: "Base", items: [messagesItem(100)] },
				],
			});

			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
