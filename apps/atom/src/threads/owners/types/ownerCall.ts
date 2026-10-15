import type { CatalogRow } from "@autumn/balance-engine";
import type { ApiVersion, TrackResponseV3 } from "@autumn/shared";
import type { AtomError } from "../../../http/handlers/errorHandler/atomErrorOf.js";
import type { ForwardReason } from "../../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../../processor/types/check.js";
import type {
	FinalizeRequest,
	FinalizeResponse,
} from "../../../processor/types/finalize.js";
import type { CheckAnswer } from "../../../processor/types/slotProcessor.js";
import type { TrackRequest } from "../../../processor/types/track.js";
import type { CustomerHandoff } from "../../../replicas/handover/types/customerHandoff.js";
import type { JournalKeyRow } from "../../../state/journal/types/journal.js";
import type {
	AppliedSubject,
	SubjectCursor,
	SubjectDigest,
} from "../../../state/repos/subjectStates.js";

/** A check as it crosses threads: plain data, with the API version by name. */
export type CheckRequestOnWire = Omit<CheckRequest, "apiVersion"> & {
	apiVersion: ApiVersion | null;
};

/** A track as it crosses threads: plain data, with the API version by name. */
export type TrackRequestOnWire = Omit<TrackRequest, "apiVersion"> & {
	apiVersion: ApiVersion;
};

/** A finalize as it crosses threads: plain data, with the API version by name. */
export type FinalizeRequestOnWire = Omit<FinalizeRequest, "apiVersion"> & {
	apiVersion: ApiVersion;
};

/** The whole shared catalog, as Autumn sent it. */
export type CatalogUpdate = { rows: CatalogRow[]; readAt: number };

/** A call to the thread that owns a customer's slot, in the folder `atomId` names (null: a deployment's one folder). */
export type OwnerCallBody = { atomId: string | null } & (
	| { type: "check"; request: CheckRequestOnWire }
	| { type: "track"; request: TrackRequestOnWire }
	| { type: "finalize"; request: FinalizeRequestOnWire }
	| { type: "setSubject"; customerId: string; body: string }
	| { type: "receiveHandoff"; handoffs: CustomerHandoff[] }
	| { type: "receiveRelayedKeys"; keys: JournalKeyRow[] }
	| { type: "deleteSubject"; customerId: string; body: string }
	| { type: "setCatalog"; catalog: CatalogUpdate }
	| { type: "installCatalog"; catalog: CatalogUpdate }
	/** The slot's subjects written at or after `after`, past `cursor`, for a replica copying what it missed. */
	| {
			type: "listSince";
			slot: number;
			after: number | null;
			cursor: SubjectCursor | null;
			limit: number;
	  }
	| {
			type: "digestSince";
			slot: number;
			after: number | null;
			cursor: SubjectCursor | null;
			limit: number;
	  }
	| {
			type: "fetchSubjects";
			slot: number;
			keys: { customerId: string; entityId: string }[];
	  }
	/** A page of the slot's idempotency keys of the last 90 min, for a replica copying them as it boots. */
	| {
			type: "recentKeys";
			slot: number;
			after: JournalKeyRow | null;
			limit: number;
	  }
);

/** A digest across threads or replicas: its one bigint as decimal text. */
export type SubjectDigestOnWire = Omit<SubjectDigest, "logOffset"> & {
	logOffset: string;
};

/** A written subject as it crosses threads or replicas: its bigints as decimal text. */
/** Each kind of row as it crosses, its 64-bit versions as strings. */
type SubjectOnWire<Row> = Row extends AppliedSubject["subject"]
	? Omit<Row, "logOffset" | "customerVersion"> & {
			logOffset: string;
			customerVersion: string;
		}
	: never;

export type AppliedSubjectOnWire = {
	subject: SubjectOnWire<AppliedSubject["subject"]>;
	appliedAt: number;
};

/**
 * Numbered by the caller, which matches the reply to it. Crosses as JSON text, since a structured clone of parsed data costs
 * about 3× as much; a subject push crosses as an object, whose one large field is already text and so clones as a copy.
 */
export type OwnerCall = OwnerCallBody & { id: number };

/** The owner's answer (a check's is its JSON and verdict); one it cannot answer carries the reason, so the caller's thread forwards it. */
export type OwnerReply =
	| {
			id: number;
			ok: true;
			value:
				| CheckAnswer
				| TrackResponseV3
				| FinalizeResponse
				| boolean
				| AppliedSubjectOnWire[]
				| SubjectDigestOnWire[]
				| JournalKeyRow[]
				| { held: number };
	  }
	| {
			id: number;
			ok: false;
			cannotAnswer: ForwardReason | null;
			/** The push can never apply: thrown again on the caller's thread as InvalidPushError. */
			invalid: boolean;
			/** The owner is still catching up: thrown again as OwnerUnavailableError, a 503 the caller's API answers. */
			unavailable: boolean;
			/** An answer in the API's shape, such as a lock refused as open: thrown again as AtomApiError. */
			apiError: AtomError | null;
			message: string;
	  };
