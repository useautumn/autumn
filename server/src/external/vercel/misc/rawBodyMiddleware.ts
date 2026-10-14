import { logCaughtError } from "@/utils/logging/logCaughtError.js";

export const captureRawBody = async (c: any, next: any) => {
	const rawBody = await c.req.text();
	c.set("rawBody", rawBody);
	let parsedBody: unknown;
	let hasParsedBody = false;

	c.req.json = async () => {
		if (hasParsedBody) {
			return parsedBody;
		}

		try {
			parsedBody = JSON.parse(rawBody);
		} catch (error) {
			const ctx = c.get?.("ctx");
			logCaughtError({
				logger: ctx?.logger,
				message: "[vercel/rawBody] Failed to parse cached raw body as JSON",
				error,
				data: { rawBodyLength: rawBody.length },
				level: "warn",
			});
			parsedBody = {};
		}

		hasParsedBody = true;
		return parsedBody;
	};

	await next();
};
