export const ApprovalErrorCode = {
	PermissionDenied: "permission_denied",
} as const;

export type ApprovalErrorCode =
	(typeof ApprovalErrorCode)[keyof typeof ApprovalErrorCode];
