import {
	canonicalizeJsonValue,
	type JsonValue,
	type MutatingCommand,
	type SubjectState,
} from "@autumn/balance-engine";

const filtersKey = (filters: object | undefined) =>
	canonicalizeJsonValue((filters ?? null) as JsonValue);

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
				...(command.lock ? [command.lock.lockId] : []),
			]);
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
		case "reset":
			return JSON.stringify([...identityKey, command.type]);
		case "applyBillingPlan":
			return JSON.stringify(
				canonicalizeJsonValue(
					JSON.parse(
						JSON.stringify([...identityKey, command.entityIds, command.ops]),
					),
				),
			);
		case "updateBalance":
			return JSON.stringify([
				...identityKey,
				command.featureId,
				filtersKey(command.customerEntitlementFilters),
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
				filtersKey(command.customerEntitlementFilters),
				command.recalculate,
			]);
		case "recalculateBalance":
			return JSON.stringify([
				...identityKey,
				command.featureId,
				filtersKey(command.customerEntitlementFilters),
			]);
		case "evict":
			return JSON.stringify([...identityKey, command.type]);
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
