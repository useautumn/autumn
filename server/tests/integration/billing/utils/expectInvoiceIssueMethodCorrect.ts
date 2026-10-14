import { expect } from "bun:test";
import {
	ALL_STATUSES,
	type ApiListInvoiceV1,
	type CusProductStatus,
	type InvoiceIssueMethod,
} from "@autumn/shared";
import {
	expectIssuedAs,
	listInvoices,
} from "@tests/integration/invoices/issue-method/utils/issueMethodTestUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

type Scenario = Awaited<ReturnType<typeof initScenario>>;

/** The customer has `count` invoices, and the newest `issuedCount` (default all) were issued per the issue method. */
export const expectInvoicesIssuedAs = async ({
	autumnV2_3,
	customerId,
	issueMethod,
	count,
	issuedCount = count,
}: {
	autumnV2_3: Scenario["autumnV2_3"];
	customerId: string;
	issueMethod: InvoiceIssueMethod;
	count: number;
	issuedCount?: number;
}): Promise<ApiListInvoiceV1[]> => {
	const invoices = await listInvoices({ autumnV2_3, customerId });
	expect(invoices).toHaveLength(count);
	for (const invoice of invoices.slice(0, issuedCount)) {
		await expectIssuedAs({ invoice, issueMethod });
	}
	return invoices;
};

/** The plan's customer_product rows have these statuses (one row with `status` by default), in any order. */
export const expectPlanStatus = async ({
	customerId,
	planId,
	status,
	statuses = [status],
}: {
	customerId: string;
	planId: string;
	status: CusProductStatus;
	statuses?: CusProductStatus[];
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const rows = (
		await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer?.internal_id ?? "",
			inStatuses: ALL_STATUSES,
		})
	).filter((customerProduct) => customerProduct.product.id === planId);
	expect(rows.map((row) => row.status).sort()).toEqual([...statuses].sort());
};
