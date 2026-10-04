import type { MeteringIdentity } from "@autumn/balance-engine";
import type { CheckLeases } from "./types/checkLeases.js";

/** `send`, ending this server's check leases on the customers each call writes to; `send` itself when leases are off. */
export function invalidatesCheckLeases<Params, Result>({
	leases,
	send,
	identitiesOf,
}: {
	leases: CheckLeases | undefined;
	send: (params: Params) => Promise<Result>;
	identitiesOf: (params: Params) => readonly MeteringIdentity[];
}): (params: Params) => Promise<Result> {
	if (!leases) return send;
	const held = leases;
	function sendInvalidating(params: Params): Promise<Result> {
		function run(): Promise<Result> {
			return send(params);
		}
		return held.invalidating({ identities: identitiesOf(params), run });
	}
	return sendInvalidating;
}

/** The same for a catalog change, which ends every lease of the org. */
export function invalidatesOrgCheckLeases<
	Params extends { orgId: string; env: string },
>({
	leases,
	send,
}: {
	leases: CheckLeases | undefined;
	send: (params: Params) => Promise<void>;
}): (params: Params) => Promise<void> {
	if (!leases) return send;
	const held = leases;
	function sendInvalidating(params: Params): Promise<void> {
		function run(): Promise<void> {
			return send(params);
		}
		return held.invalidatingOrg({ orgId: params.orgId, env: params.env, run });
	}
	return sendInvalidating;
}

export function commandIdentityOf(params: {
	command: { identity: MeteringIdentity };
}): MeteringIdentity[] {
	return [params.command.identity];
}

export function requestIdentityOf(params: {
	request: { command: { identity: MeteringIdentity } };
}): MeteringIdentity[] {
	return [params.request.command.identity];
}

function identityOf(command: { identity: MeteringIdentity }): MeteringIdentity {
	return command.identity;
}

export function commandsIdentitiesOf(params: {
	commands: readonly { identity: MeteringIdentity }[];
}): MeteringIdentity[] {
	return params.commands.map(identityOf);
}
