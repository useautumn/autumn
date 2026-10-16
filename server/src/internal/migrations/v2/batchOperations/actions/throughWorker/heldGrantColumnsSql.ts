import { RELEVANT_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { HeldRowSchema } from "./types/heldRow.js";

const workerLoadedStatusesSql = sql`string_to_array(${RELEVANT_STATUSES.join(",")}, ',')`;

/** Mirrors what a worker loads: relevant statuses, and a license seat only while its parent is loaded. */
const productLoadedByWorkerSql = sql`(
	CASE
		WHEN cp.customer_license_link_id IS NULL
			THEN cp.status = ANY(${workerLoadedStatusesSql})
		ELSE cp.internal_entity_id IS NOT NULL AND EXISTS (
			SELECT 1
			FROM customer_licenses AS license_link
			JOIN customer_products AS license_parent
				ON license_parent.id = license_link.parent_customer_product_id
			WHERE license_link.link_id = cp.customer_license_link_id
				AND license_link.internal_customer_id = cp.internal_customer_id
				AND license_parent.status = ANY(${workerLoadedStatusesSql})
		)
	END
)`;

/** What a grant row (`live` on `cp`) must carry to become a guarded worker op. */
export const heldGrantSelectSql = sql`,
	live.entitlement_id AS "entitlementId",
	COALESCE(live.internal_entity_id, cp.internal_entity_id) AS "ownerInternalEntityId",
	grant_owner.id AS "ownerEntityId",
	cp.internal_product_id AS "internalProductId",
	cp.is_custom AS "productIsCustom",
	ARRAY(
		SELECT product_price.id
		FROM customer_prices AS product_price
		WHERE product_price.customer_product_id = cp.id
		ORDER BY product_price.id
	) AS "customerPriceIds",
	${productLoadedByWorkerSql} AS "productLoadedByWorker"
`;

export const heldGrantJoinSql = sql`
	LEFT JOIN entities AS grant_owner
		ON grant_owner.internal_id = COALESCE(live.internal_entity_id, cp.internal_entity_id)
`;

export const HeldGrantColumnsSchema = HeldRowSchema.extend({
	entitlementId: z.string(),
});
