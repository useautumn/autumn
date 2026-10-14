import type { MiddlewareHandler } from "hono";
import qs from "qs";

export const queryMiddleware = (): MiddlewareHandler => {
	return async (c, next) => {
		const url = new URL(c.req.url);
		const queryString = url.search.slice(1);

		if (queryString) {
			const parsed = qs.parse(queryString, {
				comma: true,
				depth: 5,
				allowDots: false,
				decoder: (str, defaultDecoder, charset, type) => {
					if (type === "value") {
						if (str === "true") return true;
						if (str === "false") return false;
					}
					return defaultDecoder(str, defaultDecoder, charset);
				},
			});

			// @ts-expect-error - Hono's query parsing internals
			c.req.query = (key?: string) => {
				if (key) {
					return parsed[key];
				}
				return parsed;
			};
		}

		await next();
	};
};
