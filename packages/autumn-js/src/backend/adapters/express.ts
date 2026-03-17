import type { NextFunction, Request, RequestHandler, Response } from "express";
import { type AuthResult, createCoreHandler } from "../core";

export type ExpressAutumnHandlerOptions = {
	/** Function to identify the customer from the request */
	identify: (req: Request) => AuthResult;
	/** Autumn API secret key */
	secretKey?: string;
	/** Autumn API URL */
	autumnURL?: string;
	/** Path prefix for routes (default: "/api/autumn") */
	pathPrefix?: string;
};

export function autumnHandler(options: ExpressAutumnHandlerOptions): RequestHandler {
	const pathPrefix = options.pathPrefix ?? "/api/autumn";
	const core = createCoreHandler({
		identify: (raw) => options.identify(raw as Request),
		secretKey: options.secretKey,
		autumnURL: options.autumnURL,
		pathPrefix,
	});

	return async (req: Request, res: Response, next: NextFunction) => {
		// When mounted via app.use("/api/autumn", ...), Express strips the prefix
		// so re-attach it. When mounted via bare app.use(...), the prefix is already there.
		const path = req.path.startsWith(pathPrefix)
			? req.path
			: `${pathPrefix}${req.path}`;

		const body = req.method !== "GET" ? (req.body ?? null) : null;

		const result = await core({
			method: req.method,
			path,
			body,
			raw: req,
		});

		if (
			result.status === 404 &&
			(result.body as { code?: string })?.code === "not_found"
		) {
			return next();
		}

		if (result.status === 204) {
			return res.sendStatus(204);
		}

		return res.status(result.status).json(result.body);
	};
}
