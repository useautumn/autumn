import { sql } from "drizzle-orm";
import { planLicenseFullProductJson } from "@/internal/licenses/repos/utils/planLicenseFullProductSql.js";

/**
 * CTE pair for the subject query's `customer_licenses` column: one row per
 * customer license on a live parent (with its effective plan license and
 * product), then packed into one JSON array per subject. Expects the
 * `cus_products` and `subject_records` CTEs in scope.
 */
export const composeCustomerLicensesCtes = () => sql`
		customer_license_rows AS (
			SELECT
				cp.subject_key,
				to_jsonb(cl.*) AS customer_license,
				to_jsonb(pl.*) AS plan_license,
				${planLicenseFullProductJson({
					planLicenseAlias: "pl",
					productAlias: "license_product",
				})} AS product
			FROM customer_licenses cl
			JOIN cus_products cp
				ON cp.id = cl.parent_customer_product_id
			-- Customer subjects only; entity flows never carry licenses.
			JOIN subject_records sr
				ON sr.subject_key = cp.subject_key
				AND sr.internal_entity_id IS NULL
			JOIN products license_product
				ON license_product.internal_id = cl.license_internal_product_id
			-- The pool anchors its effective definition directly (catalog or
			-- custom row); NULL means the link was removed.
			LEFT JOIN plan_license pl
				ON pl.id = cl.plan_license_id
		),

		customer_licenses_agg AS (
			SELECT
				clr.subject_key,
				json_agg(
					json_build_object(
						'customerLicense', clr.customer_license,
						'planLicense', clr.plan_license,
						'product', clr.product
					)
					ORDER BY clr.customer_license->>'id'
				) AS items
			FROM customer_license_rows clr
			GROUP BY clr.subject_key
		)`;
