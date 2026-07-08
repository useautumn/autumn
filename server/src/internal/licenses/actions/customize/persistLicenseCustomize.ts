import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { insertCustomItems } from "@/internal/customers/attach/attachUtils/insertCustomItems.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import type { LicenseCustomizeComputation } from "./computeLicenseCustomize.js";

export const persistLicenseCustomize = async ({
	ctx,
	planLicenseId,
	computation,
}: {
	ctx: AutumnContext;
	planLicenseId: string;
	computation: LicenseCustomizeComputation;
}) => {
	const { effectiveProduct, customPrices, customEntitlements } = computation;
	const priceReferencedEntitlementIds = new Set(
		effectiveProduct.prices
			.map((price) => price.entitlement_id)
			.filter((id): id is string => Boolean(id)),
	);
	const items = [
		...effectiveProduct.prices.map((price) => ({
			entitlementId: price.entitlement_id ?? undefined,
			priceId: price.id,
		})),
		...effectiveProduct.entitlements
			.filter((ent) => !priceReferencedEntitlementIds.has(ent.id))
			.map((ent) => ({ entitlementId: ent.id })),
	];
	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		if (customPrices.length > 0 || customEntitlements.length > 0) {
			await insertCustomItems({
				db: txDb,
				customPrices,
				customEnts: customEntitlements,
			});
		}
		await licenseItemRepo.replaceItems({
			db: txDb,
			planLicenseId,
			items,
		});
	});
};

export const clearLicenseCustomize = async ({
	ctx,
	planLicenseId,
}: {
	ctx: AutumnContext;
	planLicenseId: string;
}) => {
	await ctx.db.transaction(async (tx) => {
		await licenseItemRepo.replaceItems({
			db: tx as unknown as DrizzleCli,
			planLicenseId,
			items: [],
		});
	});
};
