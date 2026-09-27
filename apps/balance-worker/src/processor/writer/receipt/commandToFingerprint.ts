import {
	canonicalizeJsonValue,
	type MutatingCommand,
	type SubjectState,
} from "@autumn/balance-engine";

/** What a retry must repeat: the request, never its envelope (requestId, occurredAt) or the state it lands on. */
export const commandToFingerprint = ({
	command,
	baseline,
}: {
	command: MutatingCommand;
	baseline?: SubjectState;
}): string => {
	const { identity } = command;
	const identityKey = [
		identity.orgId,
		identity.env,
		identity.customerId,
		identity.entityId,
	];
	switch (command.type) {
		case "track":
			return JSON.stringify([
				...identityKey,
				command.featureId,
				command.value,
				command.overageBehavior,
				command.properties && Object.keys(command.properties).length > 0
					? canonicalizeJsonValue(command.properties)
					: null,
				// Appended only when present, so tracks without a lock keep the fingerprint they always had.
				...(command.lock ? [command.lock.lockId] : []),
			]);
		// Settling the same lock at a different value is a different request.
		case "finalize":
			return JSON.stringify([
				...identityKey,
				command.lock.id,
				command.finalValue,
				command.properties && Object.keys(command.properties).length > 0
					? canonicalizeJsonValue(command.properties)
					: null,
			]);
		case "confirmExpiredLock":
			return JSON.stringify([...identityKey, command.lock.id]);
		// The clock is the request, and it rides in the id; a retry carries the same id.
		case "reset":
			return JSON.stringify([...identityKey, command.type]);
		// The plan's rows are the request; a retry with different rows is a conflict.
		case "applyBillingPlan":
			return JSON.stringify(
				canonicalizeJsonValue(
					JSON.parse(
						JSON.stringify([...identityKey, command.entityIds, command.ops]),
					),
				),
			);
		// Every field is the request; a retry asking for a different balance is a conflict.
		case "updateBalance":
			return JSON.stringify([
				...identityKey,
				command.featureId,
				canonicalizeJsonValue(command.customerEntitlementFilters ?? null),
				command.remaining ?? null,
				command.usage ?? null,
				command.addToBalance ?? null,
				command.includedGrant ?? null,
				command.nextResetAt ?? null,
				command.expiresAt ?? null,
			]);
		case "deleteBalance":
			return JSON.stringify([
				...identityKey,
				command.featureId ?? null,
				canonicalizeJsonValue(command.customerEntitlementFilters ?? null),
				command.recalculate,
			]);
		case "recalculateBalance":
			return JSON.stringify([
				...identityKey,
				command.featureId,
				canonicalizeJsonValue(command.customerEntitlementFilters ?? null),
			]);
		// The baseline rows are the request; a retry with different rows is a conflict.
		case "initialize":
			return JSON.stringify(
				canonicalizeJsonValue(
					JSON.parse(
						JSON.stringify([
							...identityKey,
							baseline?.customer ?? null,
							baseline?.entity ?? null,
							baseline?.customerProducts ?? [],
							baseline?.customerEntitlements ?? [],
							baseline?.rollovers ?? [],
						]),
					),
				),
			);
	}
};
