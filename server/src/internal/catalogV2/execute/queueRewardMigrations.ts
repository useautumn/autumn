import type { Price } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";

const upsertHasPriceWrites = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): boolean => {
	const prices = upsert.entitlementPricesPlan?.prices;
	if (!prices) return false;
	return (
		prices.new.length > 0 ||
		prices.updated.length > 0 ||
		prices.deleted.length > 0 ||
		prices.retired.length > 0
	);
};

const oldPricesForUpsert = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): Price[] =>
	(upsert.row.currentFullProduct ?? upsert.row.baseFullProduct)?.prices ?? [];

export const queueRewardMigrations = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	await Promise.all(
		updateCatalogPlan.upsertProducts.flatMap((upsert) => {
			if (!upsertHasPriceWrites({ upsert })) return [];

			const oldPrices = oldPricesForUpsert({ upsert });
			if (oldPrices.length === 0) return [];

			return [
				addTaskToQueue({
					jobName: JobName.RewardMigration,
					payload: {
						oldPrices,
						productId: upsert.row.planId,
						orgId: ctx.org.id,
						env: ctx.env,
					},
				}),
			];
		}),
	);
};
