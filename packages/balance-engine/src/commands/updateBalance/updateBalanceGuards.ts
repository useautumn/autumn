import { isInvoiceCreditCustomerEntitlement } from "@autumn/shared";
import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { fullSubjectToUpdateBalanceRows } from "./fullSubjectToUpdateBalanceRows.js";
import type { UpdateBalanceCommand } from "./types/updateBalanceCommand.js";

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
