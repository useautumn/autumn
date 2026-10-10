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
import { customReasonsToText } from "./customReasonsToText.js";

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
	applied,
}: {
	scalar: CustomerExportScalarRow;
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	result: CustomerProductIsCustomResult;
	applied: boolean | null;
}): CustomPlansExportRow => ({
	customer_id: scalar.id,
	name: scalar.name,
	email: scalar.email,
	// The stored id first: getFull caps how many entities it loads.
	entity_id:
		customerProduct.entity_id ??
		customerProductToEntity({
			customerProduct,
			entities: fullCustomer.entities ?? [],
		})?.id ??
		null,
	customer_product_id: customerProduct.id,
	plan_id: customerProduct.product.id,
	plan_version: String(customerProduct.product.version),
	status: customerProduct.status,
	applied: applied === null ? null : String(applied),
	outcome: result.outcome,
	reasons:
		result.outcome === "customized"
			? customReasonsToText({ reasons: result.reasons })
			: null,
	changes:
		result.outcome === "customized"
			? customPlansDiffToChanges({ diff: result.diff })
			: null,
	diff: result.outcome === "customized" ? JSON.stringify(result.diff) : null,
});

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
	applied: null,
	outcome: "export_failed",
	reasons: null,
	changes: error instanceof Error ? error.message : String(error),
	diff: null,
});
