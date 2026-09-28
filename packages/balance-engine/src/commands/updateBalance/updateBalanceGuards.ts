import { isInvoiceCreditCustomerEntitlement } from "@autumn/shared";
import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { fullSubjectToUpdateBalanceRows } from "./fullSubjectToUpdateBalanceRows.js";
import type { UpdateBalanceCommand } from "./types/updateBalanceCommand.js";

/** Legacy `assertBalanceExists`: a miss under both the feature's rows and the rows that fund it is a typo or an unassigned feature. */
export const assertBalanceExists = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: UpdateBalanceCommand;
}): void => {
	const hasOwnRows =
		fullSubjectToUpdateBalanceRows({
			fullSubject,
			command,
			includesCreditSystems: false,
		}).length > 0;
	const hasFundingRows =
		fullSubjectToUpdateBalanceRows({
			fullSubject,
			command,
			includesCreditSystems: true,
		}).length > 0;
	if (!hasOwnRows && !hasFundingRows)
		throw new UnsupportedCommandError({ reason: "balance_not_found" });
};

/** An invoice credit's balance mirrors an invoice, so only the invoice may move it. */
export const assertBalanceMutable = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: UpdateBalanceCommand;
}): void => {
	const isInvoiceCredit = fullSubjectToUpdateBalanceRows({
		fullSubject,
		command,
		includesCreditSystems: false,
	}).some((customerEntitlement) =>
		isInvoiceCreditCustomerEntitlement({ customerEntitlement }),
	);
	if (isInvoiceCredit)
		throw new UnsupportedCommandError({ reason: "invoice_credit_not_mutable" });
};
