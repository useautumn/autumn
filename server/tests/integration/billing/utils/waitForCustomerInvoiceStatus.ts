import type { ApiCustomerV3 } from "@autumn/shared";
import { pollUntil } from "@tests/utils/genUtils";
import type { AutumnInt } from "@/external/autumn/autumnCli";

export const waitForCustomerInvoiceStatus = async ({
	autumn,
	customerId,
	status,
	timeoutMs = 30_000,
	intervalMs = 500,
}: {
	autumn: AutumnInt;
	customerId: string;
	status: "paid" | "draft" | "open" | "void";
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<ApiCustomerV3> =>
	pollUntil({
		fetch: () =>
			autumn.customers.get<ApiCustomerV3>(customerId, {
				skip_cache: "true",
			}),
		until: (customer) => customer.invoices?.[0]?.status === status,
		timeoutMs,
		intervalMs,
	});
