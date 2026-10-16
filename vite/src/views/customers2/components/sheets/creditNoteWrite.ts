import type { PermissionSections } from "@/components/forms/shared/permission/billingDenialSections";

export const CREDIT_NOTE_WRITE_KEY = ["credit-note-write"] as const;

/** The credit note sheet's one field a refund limit can fail on. */
export const CREDIT_NOTE_DENIAL_SECTIONS: PermissionSections = {
	refund: "amount",
};
