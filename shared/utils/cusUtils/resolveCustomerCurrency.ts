import type { Customer } from "../../models/cusModels/cusModels.js";
import type { Organization } from "../../models/orgModels/orgTable.js";
import { orgToCurrency } from "../orgUtils/convertOrgUtils.js";

export const resolveCustomerCurrency = ({
	customer,
	org,
	requested,
	stripeCurrency,
}: {
	customer?: Pick<Customer, "currency"> | null;
	org: Organization;
	requested?: string | null;
	stripeCurrency?: string | null;
}): string =>
	(
		requested ||
		customer?.currency ||
		stripeCurrency ||
		orgToCurrency({ org })
	).toLowerCase();
