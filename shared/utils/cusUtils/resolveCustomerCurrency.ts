import type { Customer } from "../../models/cusModels/cusModels.js";
import type { Organization } from "../../models/orgModels/orgTable.js";
import { orgToCurrency } from "../orgUtils/convertOrgUtils.js";

// `requested` intentionally outranks a stored currency; enforcing the
// customer's currency lock is the attach guard's job, not this resolver's.
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
