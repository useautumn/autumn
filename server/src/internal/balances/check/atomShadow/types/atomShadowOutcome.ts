export type AtomCheckReply =
	| { kind: "answered"; body: unknown }
	| { kind: "timeout"; shed?: true }
	| { kind: "atom_error"; reason: string };

export type AtomShadowOutcome =
	| { status: "match" }
	| { status: "mismatch"; api_response: unknown; atom_response: unknown }
	| { status: "timeout" }
	| { status: "atom_error"; reason: string };

export type AtomShadowTarget = { endpointUrl: string; token: string };
