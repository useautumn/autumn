import type http from "node:http";

export const createHttpRequestTracker = <Arguments extends unknown[], Result>({
	requestHandler,
}: {
	requestHandler: (...args: Arguments) => Result | Promise<Result>;
}): {
	requestHandler: (...args: Arguments) => Promise<Awaited<Result>>;
	hasActiveRequests: () => boolean;
	waitForActiveRequests: () => Promise<void>;
} => {
	const activeRequests = new Set<Promise<Awaited<Result>>>();

	const trackedRequestHandler = (
		...args: Arguments
	): Promise<Awaited<Result>> => {
		const request = Promise.resolve(requestHandler(...args));
		activeRequests.add(request);
		void request.then(
			() => activeRequests.delete(request),
			() => activeRequests.delete(request),
		);
		return request;
	};

	return {
		requestHandler: trackedRequestHandler,
		hasActiveRequests: () => activeRequests.size > 0,
		waitForActiveRequests: async () => {
			while (activeRequests.size > 0) {
				await Promise.allSettled(Array.from(activeRequests));
			}
		},
	};
};

export const stopHttpServer = async ({
	server,
	hasActiveRequests = () => false,
	waitForActiveRequests = async () => undefined,
	shutdownTimeoutMs = 5000,
	activeRequestTimeoutMs = shutdownTimeoutMs,
	forcedRequestGraceMs = 0,
}: {
	server: http.Server;
	hasActiveRequests?: () => boolean;
	waitForActiveRequests?: () => Promise<void>;
	shutdownTimeoutMs?: number;
	activeRequestTimeoutMs?: number;
	forcedRequestGraceMs?: number;
}): Promise<boolean> => {
	const forceClosed = await new Promise<boolean>((resolve, reject) => {
		let forced = false;
		const shutdownTimeout = setTimeout(() => {
			try {
				forced = true;
				server.closeAllConnections();
				resolve(true);
			} catch (error) {
				reject(error);
			}
		}, shutdownTimeoutMs);
		shutdownTimeout.unref?.();

		try {
			server.close((error) => {
				if (forced) return;
				clearTimeout(shutdownTimeout);
				if (error) reject(error);
				else resolve(false);
			});
			server.closeIdleConnections();
		} catch (error) {
			clearTimeout(shutdownTimeout);
			reject(error);
		}
	});

	if (!forceClosed || !hasActiveRequests()) return true;

	return new Promise<boolean>((resolve, reject) => {
		const activeRequestTimeout = setTimeout(
			() => resolve(false),
			activeRequestTimeoutMs + forcedRequestGraceMs,
		);
		activeRequestTimeout.unref?.();
		void waitForActiveRequests().then(
			() => {
				clearTimeout(activeRequestTimeout);
				resolve(true);
			},
			(error: unknown) => {
				clearTimeout(activeRequestTimeout);
				reject(error);
			},
		);
	});
};
