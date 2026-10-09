import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { IsCustomByFingerprint } from "@/internal/customers/cusProducts/repos/applyIsCustomByFingerprint.js";
import { isCustomFingerprintOf } from "@/internal/customers/cusProducts/repos/applyIsCustomByFingerprint.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { listFullCustomerLicensesByParentIds } from "@/internal/licenses/repos/customerLicenseRepo/listFullCustomerLicensesByParentIds.js";
import { deriveCustomerProductIsCustom } from "./deriveCustomerProductIsCustom.js";
import { isDefinitiveIsCustomResult } from "./isDefinitiveIsCustomResult.js";
import {
	type BaseProductCache,
	loadCachedBaseProduct,
} from "./loadBaseProduct.js";

export type IsCustomDerivationCache = {
	flagsByFingerprint: IsCustomByFingerprint;
	baseProducts: BaseProductCache;
};

export const createIsCustomDerivationCache = (): IsCustomDerivationCache => ({
	flagsByFingerprint: new Map(),
	baseProducts: new Map(),
});

const loadFullWithLicenses = async ({
	ctx,
	customerProductIds,
}: {
	ctx: AutumnContext;
	customerProductIds: string[];
}): Promise<FullCusProduct[]> => {
	const [customerProducts, customerLicenses] = await Promise.all([
		customerProductRepo.listFullByIds({ db: ctx.db, customerProductIds }),
		listFullCustomerLicensesByParentIds({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			parentCustomerProductIds: customerProductIds,
		}),
	]);
	return customerProducts.map((customerProduct) => ({
		...customerProduct,
		customer_licenses: customerLicenses.filter(
			(customerLicense) =>
				customerLicense.parent_customer_product_id === customerProduct.id,
		),
	}));
};

/** A representative changed since it was fingerprinted is skipped, so its result cannot spread. */
const deriveFingerprints = async ({
	ctx,
	representatives,
	cache,
}: {
	ctx: AutumnContext;
	representatives: { id: string; fingerprint: string }[];
	cache: IsCustomDerivationCache;
}) => {
	const customerProducts = await loadFullWithLicenses({
		ctx,
		customerProductIds: representatives.map(({ id }) => id),
	});

	await Promise.all(
		representatives.map(async ({ id, fingerprint }) => {
			const customerProduct = customerProducts.find((cp) => cp.id === id);
			const stillMatches =
				customerProduct !== undefined &&
				isCustomFingerprintOf({ customerProduct }) === fingerprint;
			if (!customerProduct || !stillMatches) return;
			const result = deriveCustomerProductIsCustom({
				ctx,
				customerProduct,
				baseProduct: await loadCachedBaseProduct({
					ctx,
					internalProductId: customerProduct.internal_product_id,
					baseProducts: cache.baseProducts,
				}),
				features: ctx.features,
			});
			cache.flagsByFingerprint.set(
				fingerprint,
				isDefinitiveIsCustomResult({ result }) ? result.isCustom : null,
			);
		}),
	);
};

export const rederiveIsCustomForCustomers = async ({
	ctx,
	internalCustomerIds,
	internalProductIds,
	cache = createIsCustomDerivationCache(),
}: {
	ctx: AutumnContext;
	internalCustomerIds: string[];
	internalProductIds: string[];
	cache?: IsCustomDerivationCache;
}): Promise<{
	changedCustomers: { internalId: string; id: string | null }[];
	changed: number;
}> => {
	const apply = () =>
		customerProductRepo.applyIsCustomByFingerprint({
			db: ctx.db,
			internalCustomerIds,
			internalProductIds,
			flagsByFingerprint: cache.flagsByFingerprint,
		});

	const first = await apply();
	const updated = [...first.updated];
	if (first.unknown.length > 0) {
		await deriveFingerprints({ ctx, representatives: first.unknown, cache });
		updated.push(...(await apply()).updated);
	}

	const changedCustomers = new Map(
		updated.map((row) => [
			row.internal_customer_id,
			{ internalId: row.internal_customer_id, id: row.customer_id },
		]),
	);
	return {
		changedCustomers: [...changedCustomers.values()],
		changed: updated.length,
	};
};
