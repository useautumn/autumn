import type http from "node:http";

export const stopHttpServer = async ({
	server,
	shutdownTimeoutMs = 5000,
}: {
	server: http.Server;
	shutdownTimeoutMs?: number;
}): Promise<void> => {
	await new Promise<void>((resolve, reject) => {
		const shutdownTimeout = setTimeout(() => {
			try {
				server.closeAllConnections();
				resolve();
			} catch (error) {
				reject(error);
			}
		}, shutdownTimeoutMs);
		shutdownTimeout.unref?.();

		try {
			server.close((error) => {
				clearTimeout(shutdownTimeout);
				if (error) reject(error);
				else resolve();
			});
			server.closeIdleConnections();
		} catch (error) {
			clearTimeout(shutdownTimeout);
			reject(error);
		}
	});
};
