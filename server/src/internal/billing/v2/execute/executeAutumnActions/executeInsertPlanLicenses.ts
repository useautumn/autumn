import type { InsertPlanLicenseSpec } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { insertCustomItems } from "@/internal/customers/attach/attachUtils/insertCustomItems";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo";

export const executeInsertPlanLicenses = async ({
	ctx,
	insertPlanLicenses,
}: {
	ctx: AutumnContext;
	insertPlanLicenses?: InsertPlanLicenseSpec[];
}) => {
	if (!insertPlanLicenses?.length) return;

	const customPrices = insertPlanLicenses.flatMap((spec) => spec.customPrices);
	const customEnts = insertPlanLicenses.flatMap(
		(spec) => spec.customEntitlements,
	);
	if (customPrices.length > 0 || customEnts.length > 0) {
		await insertCustomItems({ db: ctx.db, customPrices, customEnts });
	}

	await planLicenseRepo.insertMany({
		db: ctx.db,
		rows: insertPlanLicenses.map(({ row }) => row),
	});
	for (const { row, items } of insertPlanLicenses) {
		if (items.length === 0) continue;
		await licenseItemRepo.replaceItems({
			db: ctx.db,
			planLicenseId: row.id,
			items,
		});
	}
};
