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
