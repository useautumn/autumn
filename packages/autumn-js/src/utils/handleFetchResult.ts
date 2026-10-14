export const handleFetchResult = async ({
	response,
	logger,
	logError = true,
}: {
	response: Response;
	logger: Console;
	logError?: boolean;
}): Promise<any> => {
	if (response.status === 204) {
		return null;
	}

	if (response.status < 200 || response.status >= 300) {
		let error: any;
		try {
			error = await response.json();
			if (logError) {
				logger.error(`[Autumn] ${error.message}`);
			}

			throw error;
		} catch (error) {
			// biome-ignore lint/complexity/noUselessCatch: idk
			throw error;
		}
	}

	try {
		const data = await response.json();

		return data;
	} catch (error) {
		return null;
	}
};
