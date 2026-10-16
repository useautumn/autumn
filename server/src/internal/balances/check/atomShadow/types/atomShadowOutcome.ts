/** What one `/v1/balances.check` to the shadow Atom came back with. */
export type AtomCheckReply =
	| { kind: "answered"; body: unknown }
	| { kind: "timeout"; shed?: true }
	| { kind: "atom_error"; reason: string };

/** How the Atom's answer compared with the API's; only a mismatch carries both bodies. */
export type AtomShadowOutcome =
	| { status: "match" }
	| { status: "mismatch"; api_response: unknown; atom_response: unknown }
	| { status: "timeout" }
	| { status: "atom_error"; reason: string };

/** Where the shadow check goes: our shadow Atom, the token that opens it, and how many may be open at once per process. */
export type AtomShadowTarget = {
	endpointUrl: string;
	token: string;
	maxInFlight: number;
};
