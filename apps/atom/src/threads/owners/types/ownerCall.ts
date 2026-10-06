import type { CatalogRow } from "@autumn/balance-engine";
import type { ApiVersion } from "@autumn/shared";
import type { ForwardReason } from "../../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../../processor/types/check.js";
import type { StoredSubject } from "../../../state/types/storedSubject.js";

/** A check as it crosses threads: plain data, with the API version by name. */
export type CheckRequestOnWire = Omit<CheckRequest, "apiVersion"> & {
	apiVersion: ApiVersion | null;
};

/** A subject as it crosses threads: plain data, with its 64-bit log offset as text. */
export type StoredSubjectOnWire = Omit<StoredSubject, "logOffset"> & {
	logOffset: string;
};

/** The whole shared catalog, as Autumn sent it. */
export type CatalogUpdate = { rows: CatalogRow[]; readAt: number };

/** A call to the thread that owns a customer's slot, in the folder `atomId` names (null: a deployment's one folder). */
export type OwnerCallBody = { atomId: string | null } & (
	| { type: "check"; request: CheckRequestOnWire }
	| { type: "setSubject"; subject: StoredSubjectOnWire }
	| { type: "setCatalog"; catalog: CatalogUpdate }
	| { type: "installCatalog"; catalog: CatalogUpdate }
);

/** Numbered by the caller, which matches the reply to it. Crosses as JSON text: a structured clone costs about 3× as much. */
export type OwnerCall = OwnerCallBody & { id: number };

/** The owner's answer (a check's is its response JSON); one it cannot answer carries the reason, so the caller's thread forwards it. */
export type OwnerReply =
	| { id: number; ok: true; value: string | boolean }
	| {
			id: number;
			ok: false;
			cannotAnswer: ForwardReason | null;
			message: string;
	  };
