import { sql, type SQLWrapper } from "drizzle-orm";
import { planLicenseFullProductJson } from "@/internal/licenses/repos/utils/planLicenseFullProductSql.js";

/**
 * Catalog `licenses[]` for a parent product, as a correlated jsonb subquery.
 * Used as a drizzle extras field so we never nest `licenses` under
 * `parent_plan_licenses` in the relational `with:` tree (that path hits
 * the 63-char alias limit).
 */
export const parentProductLicensesQuery = ({
	parentInternalProductId,
}: {
	parentInternalProductId: SQLWrapper;
}) => sql`(
	SELECT COALESCE(
		jsonb_agg(
			to_jsonb(parent_product_licenses.*) || jsonb_build_object(
				'product',
				${planLicenseFullProductJson({
					planLicenseAlias: "parent_product_licenses",
					productAlias: "parent_product_license_child",
				})}
			)
			ORDER BY parent_product_licenses.id
		),
		'[]'::jsonb
	)
	FROM plan_license AS parent_product_licenses
	INNER JOIN products AS parent_product_license_child
		ON parent_product_license_child.internal_id
			= parent_product_licenses.license_internal_product_id
	WHERE parent_product_licenses.parent_internal_product_id
		= ${parentInternalProductId}
		AND parent_product_licenses.is_custom = false
)`;
