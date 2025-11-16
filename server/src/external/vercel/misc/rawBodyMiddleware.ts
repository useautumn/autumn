/**
 * Raw body capture middleware for webhook signature validation
 *
 * Captures the raw request body before Hono parses it into JSON.
 * This is required for HMAC-SHA1 signature validation, which must
 * operate on the exact bytes that were sent.
 *
 * The raw body is stored in the Hono context as 'rawBody' for
 * downstream middleware to access.
 */
export const captureRawBody = async (c: any, next: any) => {
	// Read the raw body before any other middleware consumes it
	const rawBody = await c.req.text();
	c.set("rawBody", rawBody);

	// Override req.json() to use the cached raw body
	c.req.json = async () => {
		try {
			return JSON.parse(rawBody);
		} catch {
			return {};
		}
	};

	await next();
};
