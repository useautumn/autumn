import type { UpdateCatalogPlanParamsInput } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { catalogToUpdateParams } from "../../../../../../../vite/src/views/products/catalog-transfer/utils/catalogToUpdateParams";
import { messagesItem } from "../../licenses/utils/seedLicensePlans.js";

export type ExportedCatalogPlanIds = {
	monthly: string;
	annual: string;
	team: string;
	teamAnnual: string;
};

const updateAnnualRow = async ({
	ctx,
	internalId,
	update,
}: {
	ctx: AutumnContext;
	internalId: string;
	update: Parameters<typeof ProductService.updateByInternalId>[0]["update"];
}) => ProductService.updateByInternalId({ db: ctx.db, internalId, update });

/**
 * Legacy-shaped catalog: `annual` carries the old monthly/annual grouping hint
 * in products.base_variant_id, and its two oldest rows have no version_slug.
 */
export const seedExportedCatalog = async ({
	autumn,
	ctx,
	ids,
}: {
	autumn: AutumnInt;
	ctx: AutumnContext;
	ids: ExportedCatalogPlanIds;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{ plan_id: ids.monthly, name: "Monthly", items: [messagesItem(100)] },
			{ plan_id: ids.annual, name: "Annual", items: [messagesItem(1000)] },
			{
				plan_id: ids.team,
				name: "Team",
				items: [messagesItem(500)],
				variants: [
					{
						variant_plan_id: ids.teamAnnual,
						name: "Team annual",
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [messagesItem(6000)],
						},
					},
				],
			},
		],
	});
	for (const version of [2, 3, 4]) {
		await autumn.catalogV2.update({
			plans: [
				{
					plan_id: ids.annual,
					version_slug: `v${version}`,
					items: [messagesItem(1000 * version)],
					active: true,
				},
			],
		});
	}

	const annualRows = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [ids.annual],
		returnAll: true,
		skipCache: true,
	});
	const rowAt = (version: number) => {
		const row = annualRows.find((product) => product.version === version);
		if (!row) throw new Error(`missing ${ids.annual} v${version}`);
		return row.internal_id;
	};
	for (const version of [1, 2, 3, 4]) {
		await updateAnnualRow({
			ctx,
			internalId: rowAt(version),
			update: { version_slug: null },
		});
	}
	await updateAnnualRow({
		ctx,
		internalId: rowAt(3),
		update: { version_slug: "v1" },
	});
	await updateAnnualRow({
		ctx,
		internalId: rowAt(4),
		update: { version_slug: "v2", base_variant_id: ids.monthly },
	});
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
};

/** The Export modal's plans section for these ids: `annual` before `monthly`, newest version first. */
export const exportCatalogPlans = async ({
	autumn,
	ids,
}: {
	autumn: AutumnInt;
	ids: ExportedCatalogPlanIds;
}): Promise<UpdateCatalogPlanParamsInput[]> => {
	const catalog = await autumn.catalogV2.get({ include_versions: true });
	const params = catalogToUpdateParams({
		catalog,
		sections: { features: false, plans: true, rewards: false },
	});
	const order = [ids.annual, ids.monthly, ids.team];
	return (params.plans ?? [])
		.filter((plan) => order.includes(plan.plan_id))
		.sort(
			(left, right) =>
				order.indexOf(left.plan_id) - order.indexOf(right.plan_id) ||
				(right.version ?? 0) - (left.version ?? 0),
		);
};

/** The same plans as another org would receive them: every plan id swapped. */
export const renamePlanIds = <T>({
	value,
	renames,
}: {
	value: T;
	renames: Record<string, string>;
}): T => {
	let json = JSON.stringify(value);
	for (const [from, to] of Object.entries(renames))
		json = json.replaceAll(`"${from}"`, `"${to}"`);
	return JSON.parse(json) as T;
};
