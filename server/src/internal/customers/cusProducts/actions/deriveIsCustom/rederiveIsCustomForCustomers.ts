import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { isCustomFingerprintOf } from "@/internal/customers/cusProducts/repos/isCustomFingerprint.js";
import type { IsCustomFingerprintRow } from "@/internal/customers/cusProducts/repos/listIsCustomFingerprints.js";
import { listFullCustomerLicensesByParentIds } from "@/internal/licenses/repos/customerLicenseRepo/listFullCustomerLicensesByParentIds.js";
import { deriveStoredCustomerProductIsCustom } from "./deriveStoredCustomerProductIsCustom.js";
import { isDefinitiveIsCustomResult } from "./isDefinitiveIsCustomResult.js";
import type { BaseProductCache } from "./loadBaseProduct.js";

export type IsCustomDerivationCache = {
	// null: the derivation only guessed, so the flag is never written.
	flagsByFingerprint: Map<string, boolean | null>;
	baseProducts: BaseProductCache;
};

export const createIsCustomDerivationCache = (): IsCustomDerivationCache => ({
	flagsByFingerprint: new Map(),
	baseProducts: new Map(),
});

export const loadFullCustomerProductsWithLicenses = async ({
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
	const customerProducts = await loadFullCustomerProductsWithLicenses({
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
			const result = await deriveStoredCustomerProductIsCustom({
				ctx,
				customerProduct,
				baseProducts: cache.baseProducts,
			});
			cache.flagsByFingerprint.set(
				fingerprint,
				isDefinitiveIsCustomResult({ result }) ? result.isCustom : null,
			);
		}),
	);
};

const unknownRepresentatives = ({
	products,
	flagsByFingerprint,
}: {
	products: IsCustomFingerprintRow[];
	flagsByFingerprint: IsCustomDerivationCache["flagsByFingerprint"];
}) => {
	const representatives = new Map<
		string,
		{ id: string; fingerprint: string }
	>();
	for (const { id, fingerprint } of products) {
		if (flagsByFingerprint.has(fingerprint) || representatives.has(fingerprint))
			continue;
		representatives.set(fingerprint, { id, fingerprint });
	}
	return [...representatives.values()];
};

const flipsTo = ({
	products,
	flagsByFingerprint,
	to,
}: {
	products: IsCustomFingerprintRow[];
	flagsByFingerprint: IsCustomDerivationCache["flagsByFingerprint"];
	to: boolean;
}) => {
	const flipping = products.filter(
		(product) =>
			product.isCustom !== to &&
			flagsByFingerprint.get(product.fingerprint) === to,
	);
	return {
		customerProductIds: flipping.map(({ id }) => id),
		fingerprints: [...new Set(flipping.map(({ fingerprint }) => fingerprint))],
	};
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
	const products = await customerProductRepo.listIsCustomFingerprints({
		db: ctx.db,
		internalCustomerIds,
		internalProductIds,
	});
	const { flagsByFingerprint } = cache;

	const representatives = unknownRepresentatives({
		products,
		flagsByFingerprint,
	});
	if (representatives.length > 0) {
		await deriveFingerprints({ ctx, representatives, cache });
	}

	// Sequential, so a failure never leaves the other write landing after the caller's cache drop.
	const updated = [];
	for (const to of [true, false]) {
		updated.push(
			...(await customerProductRepo.flipIsCustom({
				db: ctx.db,
				...flipsTo({ products, flagsByFingerprint, to }),
				to,
			})),
		);
	}

	const changedCustomers = new Map(
		updated.map(({ internalCustomerId, customerId }) => [
			internalCustomerId,
			{ internalId: internalCustomerId, id: customerId },
		]),
	);
	return {
		changedCustomers: [...changedCustomers.values()],
		changed: updated.length,
	};
};
