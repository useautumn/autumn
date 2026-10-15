import { RELEVANT_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";

const workerLoadedStatusesSql = sql`string_to_array(${RELEVANT_STATUSES.join(",")}, ',')`;

export const productLoadedByWorkerSql = sql`(
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
