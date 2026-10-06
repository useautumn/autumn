import type { ApiVersion, CheckResponseV3 } from "@autumn/shared";
import type { ForwardReason } from "../../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../../processor/types/check.js";
import type { StoredSubject } from "../../../state/types/storedSubject.js";

/** A check as it crosses threads: plain data, with the API version by name. */
export type CheckRequestOnWire = Omit<CheckRequest, "apiVersion"> & {
	apiVersion: ApiVersion | null;
};

/** A call to the thread that owns a customer's slot, in the folder `atomId` names (null: a deployment's one folder). */
export type OwnerCallBody = { atomId: string | null } & (
	| { type: "check"; request: CheckRequestOnWire }
	| { type: "setSubject"; subject: StoredSubject }
);

/** Numbered by the caller, which matches the reply to it. */
export type OwnerCall = OwnerCallBody & { id: number };

/** The owner's answer; a check it cannot answer carries the reason, so the caller's thread forwards it as its own. */
export type OwnerReply =
	| { id: number; ok: true; value: CheckResponseV3 | boolean }
	| {
			id: number;
			ok: false;
			cannotAnswer: ForwardReason | null;
			message: string;
	  };
