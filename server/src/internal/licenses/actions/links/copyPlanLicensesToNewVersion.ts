import type { FullProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { resolveEffectiveLicenseProduct } from "../customize/resolveEffectiveLicenseProduct.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

/** Every license link the new parent version will carry forward must still
 * satisfy the link rules against `newParentProduct`, or versioning is rejected.
 * Pure check — no writes — so it can run before the version is persisted. */
export const validateCopiedPlanLicenses = async ({
	ctx,
	fromInternalProductId,
	newParentProduct,
}: {
	ctx: AutumnContext;
	fromInternalProductId: string;
	newParentProduct: FullProduct;
}) => {
	const planLicenseRows =
		await planLicenseRepo.listCatalogByParentInternalProductIds({
			db: ctx.db,
			parentInternalProductIds: [fromInternalProductId],
		});
	const licenseProducts = await Promise.all(
		planLicenseRows.map((row) =>
			getFullLicenseProduct({
				ctx,
				idOrInternalId: row.license_internal_product_id,
			}),
		),
	);
	await Promise.all(
		planLicenseRows.map(async (row, index) => {
			const licenseProduct = licenseProducts[index];
			validateLicenseLink({
				parentProduct: newParentProduct,
				licenseProduct: await resolveEffectiveLicenseProduct({
					ctx,
					licenseProduct,
					planLicenseId: row.id,
				}),
				prepaidOnly: row.prepaid_only,
				licensePlanId: licenseProduct.id,
			});
		}),
	);
};

/** Copies the previous version's catalog license links (and their item refs)
 * onto the new version. Assumes validateCopiedPlanLicenses already passed. */
export const copyPlanLicensesToNewVersion = async ({
	ctx,
	fromInternalProductId,
	toInternalProductId,
}: {
	ctx: AutumnContext;
	fromInternalProductId: string;
	toInternalProductId: string;
}) => {
	const planLicenseRows =
		await planLicenseRepo.listCatalogByParentInternalProductIds({
			db: ctx.db,
			parentInternalProductIds: [fromInternalProductId],
		});
	if (planLicenseRows.length === 0) return;

	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		for (const row of planLicenseRows) {
			const newLink = await planLicenseRepo.upsert({
				db: txDb,
				parentInternalProductId: toInternalProductId,
				licenseInternalProductId: row.license_internal_product_id,
				included: row.included,
				prepaidOnly: row.prepaid_only,
				metadata: row.metadata ?? {},
			});
			await licenseItemRepo.cloneItems({
				db: txDb,
				fromPlanLicenseId: row.id,
				toPlanLicenseId: newLink.id,
			});
		}
	});
};
