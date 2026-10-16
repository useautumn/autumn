import type { ApprovalAction } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerToFacts } from "@/internal/approvals/facts/customers/customerToFacts";
import { CusService } from "@/internal/customers/CusService";
import { checkRouteApproval } from "./checkRouteApproval";

/** Update or delete a customer, judged on the customer as it is before the change. */
export const checkCustomerApproval = ({
	ctx,
	action,
	customerId,
}: {
	ctx: AutumnContext;
	action: Extract<ApprovalAction, "customers.update" | "customers.delete">;
	customerId: string;
}) =>
	checkRouteApproval({
		ctx,
		action,
		buildFacts: async () =>
			customerToFacts({
				fullCustomer: await CusService.getFull({
					ctx,
					idOrInternalId: customerId,
				}),
			}),
	});
