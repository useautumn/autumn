import { type FullCusProduct, RELEVANT_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type IsCustomByFingerprint = Map<string, boolean | null>;

/** Matches string_agg: nulls skipped, null for no rows, ids sorted in "C" order. */
const joinSorted = (ids: (string | null)[]) => {
	const present = ids.filter((id): id is string => id !== null);
	return present.length > 0 ? present.sort().join(",") : null;
};

export const isCustomFingerprintOf = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): string =>
	[
		customerProduct.internal_product_id,
		customerProduct.processor?.type ?? null,
		joinSorted(
			customerProduct.customer_entitlements.map(
				(customerEntitlement) => customerEntitlement.entitlement_id,
			),
		),
		joinSorted(
			customerProduct.customer_prices.map(
				(customerPrice) => customerPrice.price_id,
			),
		),
		joinSorted(
			(customerProduct.customer_licenses ?? []).map(
				(customerLicense) => customerLicense.plan_license_id ?? "-",
			),
		),
	]
		.filter((segment) => segment !== null)
		.join("|");

export type ApplyIsCustomByFingerprintResult = {
	updated: {
		id: string;
		internal_customer_id: string;
		customer_id: string | null;
	}[];
	unknown: { id: string; fingerprint: string }[];
};

/** The fingerprint covers everything the derivation reads, so equal fingerprints share a flag. */
export const applyIsCustomByFingerprint = async ({
	db,
	internalCustomerIds,
	internalProductIds,
	flagsByFingerprint,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	internalProductIds: string[];
	flagsByFingerprint: IsCustomByFingerprint;
}): Promise<ApplyIsCustomByFingerprintResult> => {
	if (internalCustomerIds.length === 0 || internalProductIds.length === 0) {
		return { updated: [], unknown: [] };
	}

	const known = [...flagsByFingerprint];
	const rows = (await db.execute(sql`
		WITH fingerprinted AS MATERIALIZED (
			SELECT
				cp.id,
				cp.internal_customer_id,
				cp.is_custom,
				concat_ws(
					'|',
					cp.internal_product_id,
					cp.processor->>'type',
					(SELECT string_agg(ce.entitlement_id, ',' ORDER BY ce.entitlement_id COLLATE "C")
						FROM customer_entitlements ce WHERE ce.customer_product_id = cp.id),
					(SELECT string_agg(cpr.price_id, ',' ORDER BY cpr.price_id COLLATE "C")
						FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id),
					(SELECT string_agg(coalesce(cl.plan_license_id, '-'), ',' ORDER BY coalesce(cl.plan_license_id, '-') COLLATE "C")
						FROM customer_licenses cl WHERE cl.parent_customer_product_id = cp.id)
				) AS fingerprint
			FROM customer_products cp
			WHERE cp.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
				AND cp.internal_product_id = ANY(${sql.param(internalProductIds)}::text[])
				AND cp.status = ANY(${sql.param(RELEVANT_STATUSES)}::text[])
		),
		known AS (
			SELECT *
			FROM unnest(
				${sql.param(known.map(([fingerprint]) => fingerprint))}::text[],
				${sql.param(known.map(([, isCustom]) => isCustom))}::boolean[]
			) AS known(fingerprint, is_custom)
		),
		updated AS (
			UPDATE customer_products cp
			SET is_custom = known.is_custom, updated_at = ${Date.now()}
			FROM fingerprinted
			JOIN known ON known.fingerprint = fingerprinted.fingerprint
			WHERE cp.id = fingerprinted.id
				AND known.is_custom IS NOT NULL
				AND fingerprinted.is_custom <> known.is_custom
				AND cp.is_custom = fingerprinted.is_custom
			RETURNING cp.id, cp.internal_customer_id, cp.customer_id
		)
		SELECT 'updated' AS kind, id, internal_customer_id, customer_id, NULL::text AS fingerprint
		FROM updated
		UNION ALL
		(
			SELECT DISTINCT ON (fingerprinted.fingerprint)
				'unknown', fingerprinted.id, fingerprinted.internal_customer_id, NULL::text, fingerprinted.fingerprint
			FROM fingerprinted
			WHERE NOT EXISTS (
				SELECT 1 FROM known WHERE known.fingerprint = fingerprinted.fingerprint
			)
			ORDER BY fingerprinted.fingerprint
		)
	`)) as unknown as {
		kind: "updated" | "unknown";
		id: string;
		internal_customer_id: string;
		customer_id: string | null;
		fingerprint: string | null;
	}[];

	return {
		updated: rows
			.filter((row) => row.kind === "updated")
			.map(({ id, internal_customer_id, customer_id }) => ({
				id,
				internal_customer_id,
				customer_id,
			})),
		unknown: rows.flatMap((row) =>
			row.kind === "unknown" && row.fingerprint
				? [{ id: row.id, fingerprint: row.fingerprint }]
				: [],
		),
	};
};
