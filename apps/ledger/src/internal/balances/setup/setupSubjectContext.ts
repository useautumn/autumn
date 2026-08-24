import { CustomerNotFoundError, type Feature } from "@autumn/shared";
import type { Command } from "../../../api/types/command.js";
import { customerStore } from "../../../sqlite/customers/store/customerStore.js";
import type { SqliteContext } from "../../../sqlite/common/types/sqliteContext.js";
import { loadSubject } from "../../subjects/actions/loadSubject.js";
import type { Subject } from "../../subjects/types/subject.js";
import { selectCustomerEntitlements } from "./selectCustomerEntitlements.js";
import { sortCustomerEntitlements } from "./sortCustomerEntitlements.js";

// The subject as this command sees it: the resident rows for its features,
// narrowed to the ones it may fold, in deduction order.
export const setupSubjectContext = ({
	ctx,
	command,
	features,
}: {
	ctx: SqliteContext;
	command: Command;
	features: Feature[];
}): Subject => {
	const customerId = command.customer_id;
	const customer = customerStore.getByCustomerId({
		ctx,
		orgId: command.org_id,
		env: command.env,
		customerId,
	});
	if (!customer) throw new CustomerNotFoundError({ customerId });

	const subject = loadSubject({
		ctx,
		internalCustomerId: customer.internal_id,
		features,
	});

	return {
		...subject,
		customerEntitlements: sortCustomerEntitlements({
			customerEntitlements: selectCustomerEntitlements({
				customerEntitlements: subject.customerEntitlements,
				at: command.at,
			}),
		}),
	};
};
