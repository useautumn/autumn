import type {
	MutatingCommand,
	MutationEffect,
	MutationRecord,
	MutationSource,
	SubjectState,
	SubjectStateMutation,
} from "@autumn/balance-engine";

export type MutateParams = {
	state: SubjectState | null;
};

export type MutationDurability = "log" | "store";

export type MutationSubmission<Reply> = {
	command: MutatingCommand;
	baseline?: SubjectState;
	durability?: MutationDurability;
	source?: MutationSource;
	mutate: (params: MutateParams) => MutationResult<Reply>;
};

export type MutationResult<Reply> =
	| {
			kind: "write";
			mutation: SubjectStateMutation;
			nextState: SubjectState;
			projectedStates?: SubjectState[];
			effects?: MutationEffect[];
	  }
	| { kind: "reply"; reply: Reply };

export type CommittedMutation = {
	kind: "new" | "duplicate";
	mutation: MutationRecord;
	state: SubjectState;
};

export type DecidedMutation<Reply> = {
	kind: "write" | "duplicate" | "reply";
	waitForCommit(): Promise<Reply | CommittedMutation>;
	waitForStore(): Promise<void>;
};

export type HeldSubmission<Reply> = Pick<
	MutationSubmission<Reply>,
	"command" | "mutate"
> & {
	replyOf: (committed: CommittedMutation) => string;
};

export type HeldDecision<Reply> =
	| { kind: "write"; seq: number; body: string }
	| { kind: "duplicate"; seq: number; body: string }
	| { kind: "reply"; reply: Reply };
