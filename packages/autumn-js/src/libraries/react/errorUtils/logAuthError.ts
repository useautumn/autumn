export const logAuthError = async (response: Response) => {
	if (response.status === 401) {
		const clonedResponse = response.clone();
		const data = await clonedResponse.json();

		if (data.message.includes("Missing authorization header")) {
			console.error(`[Autumn] Missing authorization header.

Use the getBearerToken prop in <AutumnProvider /> to set the authorization header.
https://docs.useautumn.com/quickstart/quickstart#5-set-up-autumnprovider`);

			return true;
		}
	}

	return false;
};
