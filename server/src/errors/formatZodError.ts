import type { ZodError, ZodIssue } from "zod/v4";

/**
 * Formats Zod validation errors into user-friendly messages
 */
export function formatZodError(error: ZodError): string {
	const formatMessage = (issue: ZodIssue): string => {
		const path = issue.path.length ? issue.path.join(".") : "input";

		// Clean up common Zod error messages
		let message = issue.message;

		// Handle common patterns and make them more user-friendly
		if (
			message.includes("Too small") &&
			message.includes("expected string to have >=1 characters")
		) {
			message = "cannot be empty";
		} else if (message.includes("Invalid option: expected one of")) {
			// Clean up enum error messages
			// Example: 'Invalid option: expected one of "a"|"b"|"c"' -> 'must be one of: a, b, c'
			const match = message.match(/expected one of (.+)/);
			if (match) {
				const options = match[1]
					.split("|")
					.map((opt) => opt.replace(/['"]/g, "").trim())
					.join(", ");
				message = `must be one of: ${options}`;
			}
		} else if (message.includes("Invalid string: must match pattern")) {
			// Extract the pattern and make it more readable
			if (message.includes("/^[a-zA-Z0-9_-]+$/")) {
				message =
					"must contain only letters, numbers, underscores, and hyphens";
			} else {
				message = "has invalid format";
			}
		} else if (message.includes("Invalid input: expected string, received")) {
			const receivedType = message.split("received ")[1];
			message = `must be a string (received ${receivedType})`;
		} else if (message.includes("Invalid input: expected number, received")) {
			const receivedType = message.split("received ")[1];
			message = `must be a number (received ${receivedType})`;
		} else if (message.includes("Invalid input: expected boolean, received")) {
			const receivedType = message.split("received ")[1];
			message = `must be a boolean (received ${receivedType})`;
		}

		return `${path}: ${message}`;
	};

	const formattedIssues = error.issues.map(formatMessage);

	// If there are multiple issues, format them nicely
	if (formattedIssues.length === 1) {
		return formattedIssues[0];
	}
	return `[Validation Errors] ${formattedIssues.join("; ")}`;
}
