export const secretKeyCheck = (secretKey?: string) => {
	if (!secretKey && !process.env.AUTUMN_SECRET_KEY) {
		return {
			found: false,
			error: {
				statusCode: 500,
				message: `Autumn secret key not found in ENV variables or passed into autumnHandler`,
				code: "no_secret_key",
			},
		};
	}

	return { found: true, error: null };
};
