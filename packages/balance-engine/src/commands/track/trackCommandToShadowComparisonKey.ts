import type { TrackCommand } from "./types/trackCommand.js";

export const trackCommandToShadowComparisonKey = ({
	command,
}: {
	command: TrackCommand;
}): string =>
	JSON.stringify([
		command.identity.orgId,
		command.identity.env,
		command.identity.customerId,
		command.featureId,
		command.commandId,
	]);
