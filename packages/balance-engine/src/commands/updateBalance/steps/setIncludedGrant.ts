import { cusEntsToAllowance, isEntityScopedCusEnt } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { UnsupportedCommandError } from "../../../errors.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";
import { fullSubjectToUpdateBalanceRows } from "../fullSubjectToUpdateBalanceRows.js";
import type { UpdateBalanceCommand } from "../types/updateBalanceCommand.js";

export const setIncludedGrant = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: UpdateBalanceCommand;
}): RowChange[] => {
	const { includedGrant } = command;
	if (includedGrant === undefined) return [];
	const customerEntitlements = fullSubjectToUpdateBalanceRows({
		fullSubject,
		command,
		includesCreditSystems: false,
	});
	const [targetRow] = customerEntitlements;
	if (!targetRow)
		throw new UnsupportedCommandError({ reason: "balance_not_found" });

	const entityId = fullSubject.entity?.id ?? undefined;
	const allowance = cusEntsToAllowance({
		cusEnts: customerEntitlements,
		entityId,
		withRollovers: false,
	});
	const requiredAdjustment = new Decimal(includedGrant).minus(allowance);

	if (!isEntityScopedCusEnt(targetRow)) {
		const change = requiredAdjustment.minus(targetRow.adjustment).toNumber();
		if (change === 0) return [];
		return [
			{
				table: "customerEntitlements",
				op: "increment",
				id: targetRow.id,
				add: { adjustment: change },
			},
		];
	}

	const entityKey = entityId ?? Object.keys(targetRow.entities ?? {})[0];
	const entityBalance = entityKey ? targetRow.entities?.[entityKey] : undefined;
	if (!entityKey || !entityBalance)
		throw new UnsupportedCommandError({ reason: "balance_not_found" });
	const change = requiredAdjustment.minus(entityBalance.adjustment).toNumber();
	if (change === 0) return [];
	return [
		{
			table: "customerEntitlements",
			op: "increment",
			id: targetRow.id,
			add: {},
			addEntries: { entities: { [entityKey]: { adjustment: change } } },
		},
	];
};
