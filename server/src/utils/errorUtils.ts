import { ErrCode } from "@autumn/shared";
import chalk from "chalk";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import { ZodError, type ZodIssue } from "zod/v4";

export const isPaymentDeclined = (error: any) => {
	return (
		error instanceof RecaseError && error.code === ErrCode.StripeCardDeclined
	);
};

export default class RecaseError extends Error {
	code: string;
	data: any;
	statusCode: number;

	constructor({
		message,
		code,
		data,
		statusCode = 400,
	}: {
		message: string;
		code: string;
		data?: any;
		statusCode?: number;
	}) {
		super(message);
		this.name = "RecaseError";
		this.code = code;
		this.data = data;
		this.statusCode = statusCode;
	}

	print(logger: any) {
		logger.warn(`Code:    ${chalk.yellow(this.code)}`);
		logger.warn(`Message: ${chalk.yellow(this.message)}`);

		if (this.data) {
			logger.warn(`Data:`);
			logger.warn(this.data);
		} else {
			logger.warn("No data");
		}
	}
}

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
	} else {
		return `[Validation Errors] ${formattedIssues.join("; ")}`;
	}
}

export const handleRequestError = ({
	error,
	req,
	res,
	action,
}: {
	error: any;
	req: any;
	res: any;
	action: string;
}) => {
	try {
		const logger = req.logger;
		if (error instanceof RecaseError) {
			logger.warn(
				`RECASE WARNING (${req.org?.slug || "unknown"}): ${error.message} [${error.code}]`,
				{
					error: error.data ?? error,
				},
			);

			res.status(error.statusCode).json({
				message: error.message,
				code: error.code,
				env: req.env,
			});
			return;
		}

		if (error instanceof Stripe.errors.StripeError) {
			let curStack;
			try {
				throw new Error("test");
			} catch (e: any) {
				curStack = e.stack;
			}

			const { raw, headers, ...rest } = error;
			logger.error(
				`STRIPE ERROR (${req.org?.slug || "unknown"}): ${error.message}`,
				{
					error: {
						...rest,
						stack: curStack,
					},
				},
			);

			res.status(400).json({
				message: `(Stripe Error) ${error.message}`,
				code: `stripe_error`,
			});
		} else if (error instanceof ZodError) {
			logger.error(
				`ZOD ERROR (${req.org?.slug || "unknown"}): ${formatZodError(error)}`,
			);

			res.status(400).json({
				message: formatZodError(error),
				code: ErrCode.InvalidInputs,
			});
		} else {
			logger.error(
				`UNKNOWN ERROR (${req.org?.slug || "unknown"}): ${error.message}, ${error.stack}`,
				{
					error: {
						stack: error.stack,
						message: error.message,
					},
				},
			);

			res.status(500).json({
				message: error.message || "Unknown error",
				code: error.code || "unknown_error",
			});
		}
	} catch (error) {
		console.log("Failed to log error / warning");
		console.log(`Request: ${req.originalUrl}`);
		console.log(`Body: ${req.body}`);
		console.log(`Log Error: ${error}`);
	}
};

export const handleFrontendReqError = ({
	error,
	req,
	res,
	action,
}: {
	error: any;
	req: any;
	res: any;
	action: string;
}) => {
	try {
		const logger = req.logger;
		if (
			error instanceof RecaseError &&
			error.statusCode === StatusCodes.NOT_FOUND
		) {
			// Temporarily disable logger to prevent thread-stream crashes
			console.log(`(frontend) ${req.method} ${req.originalUrl}: not found`);
			res.status(404).json({
				message: error.message,
				code: error.code,
			});
			return;
		}

		logger.error(
			`(frontend) ${req.method} ${req.originalUrl}: ${error.message}`,
			{
				error,
			},
		);

		res.status(400).json({
			message: error.message || "Unknown error",
			code: error.code || "unknown_error",
		});
	} catch (error) {
		console.log("Failed to log error / warning");
	}
};
