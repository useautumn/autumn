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
			// Try to extract character class from pattern like /^[a-zA-Z0-9_:-]+$/
			const charClassMatch = message.match(/\[([a-zA-Z0-9_:\-\\]+)\]/);
			if (charClassMatch) {
				const charClass = charClassMatch[1];
				const parts: string[] = [];
				if (charClass.includes("a-z") || charClass.includes("A-Z"))
					parts.push("letters");
				if (charClass.includes("0-9")) parts.push("numbers");
				if (charClass.includes("_")) parts.push("underscores");
				if (charClass.includes("-")) parts.push("hyphens");
				if (charClass.includes(":")) parts.push("colons");
				if (charClass.includes(".")) parts.push("periods");

				if (parts.length > 0) {
					message = `must contain only ${parts.join(", ")}`;
				} else {
					message = "has invalid format";
				}
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
