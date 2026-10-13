type PasskeyError = { code?: string; message?: string; status?: number };

// better-auth's freshSessionMiddleware guards passkey registration (default freshAge: 24h).
const SESSION_NOT_FRESH = "SESSION_NOT_FRESH";

const isPasskeyPromptDismissed = ({ message }: { message: string }) => {
	const lower = message.toLowerCase();
	return (
		lower.includes("cancel") ||
		lower.includes("aborted") ||
		lower.includes("not allowed")
	);
};

/** Returns null when the user dismissed the WebAuthn prompt, so no toast is shown. */
export const getAddPasskeyErrorMessage = ({
	error,
}: {
	error: PasskeyError;
}): string | null => {
	if (error.code === SESSION_NOT_FRESH) {
		return "Please log out and log in again to set a passkey.";
	}
	const message = error.message || "";
	if (isPasskeyPromptDismissed({ message })) return null;
	return message || "Failed to add passkey";
};
