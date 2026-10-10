import {
	type CreateCustomerExportParams,
	CustomerExportKind,
	type CustomerExportSpec,
	CustomerExportSpecSchema,
	type DbCustomerExport,
} from "@autumn/shared";

/** The row's jsonb columns are untyped by kind; parsing narrows them and fills
 * defaults for options older rows were written without. */
export const customerExportToSpec = ({
	customerExport,
}: {
	customerExport: DbCustomerExport;
}): CustomerExportSpec =>
	CustomerExportSpecSchema.parse({
		kind: customerExport.kind,
		fields: customerExport.fields,
		snapshot: customerExport.snapshot,
	});

export const createParamsToCustomerExportSpec = ({
	params,
}: {
	params: CreateCustomerExportParams;
}): CustomerExportSpec => {
	// The dashboard trims client-side; trimming here keeps direct API callers consistent.
	const scope = { search: params.search.trim(), filters: params.filters };

	if (params.kind === CustomerExportKind.Customers) {
		return { kind: params.kind, fields: params.fields, snapshot: scope };
	}
	if (params.kind === CustomerExportKind.CustomPlans) {
		return {
			kind: params.kind,
			fields: [],
			snapshot: { ...scope, apply: params.apply },
		};
	}
	return {
		kind: params.kind,
		fields: [],
		snapshot: {
			...scope,
			include_unlinked_stripe_customers:
				params.include_unlinked_stripe_customers,
		},
	};
};
