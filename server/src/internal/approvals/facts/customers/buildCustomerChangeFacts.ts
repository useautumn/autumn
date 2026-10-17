import type { CustomerChangeFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildApprovalCustomerFacts } from "@/internal/approvals/facts/customer/buildApprovalCustomerFacts";
import { CusService } from "@/internal/customers/CusService";

/** Updating or deleting a customer, judged on the customer as it is before the change. */
export const buildCustomerChangeFacts = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<CustomerChangeFacts> => ({
	customer: await buildApprovalCustomerFacts({
		ctx,
		fullCustomer: await CusService.getFull({ ctx, idOrInternalId: customerId }),
	}),
});
