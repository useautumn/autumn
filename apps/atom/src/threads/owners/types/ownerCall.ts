import type { CatalogRow } from "@autumn/balance-engine";
import type { ApiVersion } from "@autumn/shared";
import type { ForwardReason } from "../../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../../processor/types/check.js";
import type { CheckAnswer } from "../../../processor/types/slotProcessor.js";
import type {
	AppliedSubject,
	SubjectCursor,
	SubjectDigest,
} from "../../../state/repos/subjectStates.js";

export type CheckRequestOnWire = Omit<CheckRequest, "apiVersion"> & {
	apiVersion: ApiVersion | null;
};

export type CatalogUpdate = { rows: CatalogRow[]; readAt: number };

export type OwnerCallBody = { atomId: string | null } & (
	| { type: "check"; request: CheckRequestOnWire }
	| { type: "setSubject"; customerId: string; body: string }
	| { type: "deleteSubject"; customerId: string; body: string }
	| { type: "setCatalog"; catalog: CatalogUpdate }
	| { type: "installCatalog"; catalog: CatalogUpdate }
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
);

export type SubjectDigestOnWire = Omit<SubjectDigest, "logOffset"> & {
	logOffset: string;
};

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

export type OwnerCall = OwnerCallBody & { id: number };

export type OwnerReply =
	| {
			id: number;
			ok: true;
			value:
				| CheckAnswer
				| boolean
				| AppliedSubjectOnWire[]
				| SubjectDigestOnWire[];
	  }
	| {
			id: number;
			ok: false;
			cannotAnswer: ForwardReason | null;
			invalid: boolean;
			unavailable: boolean;
			message: string;
	  };
