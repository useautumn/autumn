import type { TrackCommand } from "@autumn/balance-engine";

/** Our server builds and validates every command; this only tells a command from something that is not one. */
function hasIdentity(command: { identity?: unknown }): boolean {
	const identity = command.identity as
		| Partial<TrackCommand["identity"]>
		| undefined;
	return (
		typeof identity === "object" &&
		identity !== null &&
		typeof identity.orgId === "string" &&
		typeof identity.env === "string" &&
		typeof identity.customerId === "string"
	);
}

export function looksLikeTrackCommand(input: unknown): input is TrackCommand {
	if (typeof input !== "object" || input === null) return false;
	const command = input as Partial<TrackCommand>;
	return (
		command.schemaVersion === 1 &&
		command.type === "track" &&
		typeof command.commandId === "string" &&
		hasIdentity(command)
	);
}
