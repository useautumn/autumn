import type { FullCustomer, ProductV2 } from "@autumn/shared";
import { customerProductToCustomerStatePlan } from "@/components/forms/customer-state/customerProductToCustomerStatePlan";
import type { CustomerStatePlan } from "@/components/forms/customer-state/customerStateSchema";
import { getActiveCustomerProducts } from "@/components/forms/customer-state/getActiveCustomerPlans";
import {
	type FormInvoicePlan,
	newInvoiceLicense,
	newInvoicePlan,
} from "../createInvoiceFormSchema";
import {
	customerProductToPaidFeatureQuantities,
	customerProductToPaidLicenseQuantities,
} from "./customerProductPaidQuantities";

/** A saved plan plus what the customer actually paid for, since invoices bill exclusive of grants. */
export type InvoiceExistingPlan = CustomerStatePlan & {
	paidFeatureQuantities: Record<string, number>;
	paidLicenseQuantities: Record<string, number>;
};

/** The customer's active plans, offered by "Copy existing plans". */
export function getInvoiceExistingPlans({
	customer,
	products,
}: {
	customer: FullCustomer | undefined;
	products: ProductV2[];
}): InvoiceExistingPlan[] {
	return getActiveCustomerProducts({ customer }).map((cusProduct) => ({
		...customerProductToCustomerStatePlan({ cusProduct, products }),
		paidFeatureQuantities: customerProductToPaidFeatureQuantities({
			cusProduct,
		}),
		paidLicenseQuantities: customerProductToPaidLicenseQuantities({
			cusProduct,
		}),
	}));
}

/** A customer's saved plan as an invoice row, keeping its customisations and scope. */
export function customerStatePlanToInvoicePlan({
	plan,
}: {
	plan: InvoiceExistingPlan;
}): FormInvoicePlan {
	return {
		...newInvoicePlan({ entityId: plan.entityId ?? null }),
		planId: plan.productId,
		version: plan.version,
		items: plan.items,
		isCustom: plan.isCustom,
		featureQuantities: { ...plan.paidFeatureQuantities },
		licenses: Object.entries(plan.paidLicenseQuantities).map(
			([licensePlanId, quantity]) => ({
				...newInvoiceLicense(licensePlanId),
				quantity,
			}),
		),
	};
}
