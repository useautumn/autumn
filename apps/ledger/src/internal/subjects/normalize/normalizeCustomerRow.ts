import type { customers } from "../../../sqlite/common/schema/customers.js";

type CustomerRow = typeof customers.$inferInsert;

export type NormalizedCustomerRow = CustomerRow & {
	send_email_receipts: boolean;
};

export const normalizeCustomerRow = ({
	row,
}: {
	row: CustomerRow;
}): NormalizedCustomerRow => ({
	...row,
	send_email_receipts: row.send_email_receipts ?? false,
});
