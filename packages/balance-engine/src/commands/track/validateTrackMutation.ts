import { Decimal } from "decimal.js";
import type { SubjectStateMutation } from "../../models/subjectStateMutation.js";

// Annotated so TypeScript narrows the guards that call it.
const fail: (message: string) => never = (message) => {
	throw new Error(`Invalid track mutation: ${message}`);
};

const deductedValuesByCustomerEntitlementId = ({
	changes,
}: {
	changes: SubjectStateMutation["changes"];
}): Map<string, Decimal> => {
	const deductedValues = new Map<string, Decimal>();

	for (const change of changes) {
		if (change.table !== "customerEntitlements" || change.op !== "update") {
			fail("a track can only update customer entitlements");
		}
		const { balance: balanceBefore } = change.before;
		const { balance: balanceAfter } = change.after;
		if (balanceBefore === undefined || balanceAfter === undefined) {
			fail("each change must carry balance before and after");
		}
		if (deductedValues.has(change.id)) {
			fail(`duplicate change for customer entitlement ${change.id}`);
		}

		const balanceDelta = new Decimal(balanceBefore).minus(balanceAfter);
		if (balanceDelta.lt(0)) fail(`a track cannot add balance to ${change.id}`);
		deductedValues.set(change.id, balanceDelta);
	}

	return deductedValues;
};

/** The cross-field invariants a track owns; the schema only knows the generic mutation shape. */
export const validateTrackMutation = ({
	mutation,
}: {
	mutation: SubjectStateMutation;
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

	const { customerEntitlement } = result;
	if (!new Decimal(customerEntitlement.balance).eq(result.balanceAfter)) {
		fail("result.customerEntitlement must hold the balance after the track");
	}
	for (const [customerEntitlementId] of deductedValues) {
		if (customerEntitlementId !== customerEntitlement.id) {
			fail(
				`change ${customerEntitlementId} is not the result's customer entitlement`,
			);
		}
	}
};
