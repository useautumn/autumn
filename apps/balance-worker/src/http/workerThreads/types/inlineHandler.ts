export type InlineHandler = (request: {
	route: number;
	body: Uint8Array;
}) => InlineReply | null;

export type InlineReply =
	| {
			status: number;
			body: string | Uint8Array;
			partition: number;
			heldUntilSeq: number;
	  }
	| { later: Promise<{ status: number; body: string }> };

export type HeldFailure = {
	partition: number;
	aboveSeq: number;
	lastSeq: number;
	status: number;
	body: string;
};
