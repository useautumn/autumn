import { Decimal } from "decimal.js";
import type { CustomerStateMutation } from "../../models/customerStateMutation.js";

// Annotated so TypeScript narrows the guards that call it.
const fail: (message: string) => never = (message) => {
	throw new Error(`Invalid track mutation: ${message}`);
};

const deductedValuesByCustomerEntitlementId = ({
	changes,
}: {
	changes: CustomerStateMutation["changes"];
}): Map<string, Decimal> => {
	const deductedValues = new Map<string, Decimal>();

	for (const change of changes) {
		if (change.op !== "update") {
			fail("a track can only update customer entitlements");
		}
		const { balance: balanceBefore, usage: usageBefore } = change.before;
		const { balance: balanceAfter, usage: usageAfter } = change.after;
		if (
			balanceBefore === undefined ||
			usageBefore === undefined ||
			balanceAfter === undefined ||
			usageAfter === undefined
		) {
			fail("each change must carry balance and usage before and after");
		}
		if (deductedValues.has(change.id)) {
			fail(`duplicate change for customer entitlement ${change.id}`);
		}

		const balanceDelta = new Decimal(balanceBefore).minus(balanceAfter);
		const usageDelta = new Decimal(usageAfter).minus(usageBefore);
		if (
			balanceDelta.lt(0) ||
			usageDelta.lt(0) ||
			!balanceDelta.eq(usageDelta)
		) {
			fail(`balance and usage deltas disagree for ${change.id}`);
		}
		deductedValues.set(change.id, balanceDelta);
	}

	return deductedValues;
};

/** The cross-field invariants a track owns; the schema only knows the generic mutation shape. */
export const validateTrackMutation = ({
	mutation,
}: {
	mutation: CustomerStateMutation;
}): void => {
	const { command, result } = mutation;
	if (command.type !== "track" || result.type !== "track") {
		fail("command and result must both be tracks");
	}

	const deductedValues = deductedValuesByCustomerEntitlementId({
		changes: mutation.changes,
	});
	const appliedValue = new Decimal(result.appliedValue);
	const totalDeductedValue = [...deductedValues.values()].reduce(
		(total, deductedValue) => total.plus(deductedValue),
		new Decimal(0),
	);

	if (result.requestedValue !== command.value) {
		fail("result.requestedValue must echo the tracked value");
	}
	if (!totalDeductedValue.eq(appliedValue)) {
		fail("change deltas must sum to appliedValue");
	}
	if (
		!new Decimal(result.balanceBefore)
			.minus(result.balanceAfter)
			.eq(appliedValue)
	) {
		fail("the balance delta must equal appliedValue");
	}
	if (appliedValue.gt(result.requestedValue)) {
		fail("appliedValue cannot exceed requestedValue");
	}
	if (
		command.overageBehavior === "cap" &&
		appliedValue.gt(Decimal.max(result.balanceBefore, 0))
	) {
		fail("a capped track cannot exceed the available balance");
	}

	if (result.status === "rejected") {
		const rejectedCleanly =
			result.reason === "insufficient_balance" &&
			command.overageBehavior === "reject" &&
			result.appliedValue === 0 &&
			mutation.changes.length === 0 &&
			result.balanceAfter === result.balanceBefore;
		if (!rejectedCleanly) fail("a rejected track cannot change balances");
	} else {
		if (result.reason !== null) {
			fail("an applied track cannot carry a rejection reason");
		}
		if (
			command.overageBehavior !== "cap" &&
			!appliedValue.eq(result.requestedValue)
		) {
			fail("an uncapped applied track must apply the requested value");
		}
	}

	const { balanceSnapshot } = result;
	if (!new Decimal(balanceSnapshot.balance).eq(result.balanceAfter)) {
		fail("balanceSnapshot must hold the balance after the track");
	}
	for (const [customerEntitlementId] of deductedValues) {
		if (customerEntitlementId !== balanceSnapshot.id) {
			fail(`change ${customerEntitlementId} is missing from balanceSnapshot`);
		}
	}
	const snapshotChange = mutation.changes.at(0);
	if (
		snapshotChange?.op === "update" &&
		!new Decimal(snapshotChange.after.usage ?? balanceSnapshot.usage).eq(
			balanceSnapshot.usage,
		)
	) {
		fail("balanceSnapshot usage must match the committed change");
	}
};
