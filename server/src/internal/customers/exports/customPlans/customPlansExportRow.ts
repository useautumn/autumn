import {
	type CustomerListFilters,
	type CustomPlansExportRow,
	customerProductToEntity,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { CustomerProductIsCustomResult } from "@/internal/customers/cusProducts/actions/deriveIsCustom/types/customerProductIsCustomResult";
import {
	isCustomDashboardProductFilter,
	parseDashboardVersionFilter,
} from "../../getFullCusQuery.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import { customPlansDiffToChanges } from "./customPlansDiffToChanges.js";

/** A plan/version filter scopes customer products too, not just which customers are walked. */
export const isCustomerProductInExportScope = ({
	customerProduct,
	filters,
}: {
	customerProduct: FullCusProduct;
	filters: CustomerListFilters;
}): boolean => {
	const versionFilters = parseDashboardVersionFilter(filters.version);
	if (versionFilters.length === 0) return true;

	return versionFilters.some((filter) => {
		const isSamePlan = customerProduct.product.id === filter.productId;
		if (isCustomDashboardProductFilter(filter)) {
			return isSamePlan && customerProduct.is_custom;
		}
		return isSamePlan && customerProduct.product.version === filter.version;
	});
};

export const customerProductToCustomPlansExportRow = ({
	scalar,
	fullCustomer,
	customerProduct,
	result,
}: {
	scalar: CustomerExportScalarRow;
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	result: CustomerProductIsCustomResult;
}): CustomPlansExportRow => ({
	customer_id: scalar.id,
	name: scalar.name,
	email: scalar.email,
	entity_id:
		customerProductToEntity({
			customerProduct,
			entities: fullCustomer.entities ?? [],
		})?.id ?? null,
	customer_product_id: customerProduct.id,
	plan_id: customerProduct.product.id,
	plan_version: String(customerProduct.product.version),
	status: customerProduct.status,
	reason: result.reason,
	changes:
		result.reason === "customized"
			? customPlansDiffToChanges({ diff: result.diff })
			: null,
	diff: result.reason === "customized" ? JSON.stringify(result.diff) : null,
});

/** A customer whose read failed still gets a row, so a gap in the file is never silent. */
export const failedCustomerToCustomPlansExportRow = ({
	scalar,
	error,
}: {
	scalar: CustomerExportScalarRow;
	error: unknown;
}): CustomPlansExportRow => ({
	customer_id: scalar.id,
	name: scalar.name,
	email: scalar.email,
	entity_id: null,
	customer_product_id: null,
	plan_id: null,
	plan_version: null,
	status: null,
	reason: "export_failed",
	changes: error instanceof Error ? error.message : String(error),
	diff: null,
});
