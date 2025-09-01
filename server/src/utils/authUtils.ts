export const parseAuthHeader = (req: any) => {
	const authHeader = req.headers.Authorization || req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return null;
	}
	const bearerToken = authHeader.split(" ")[1];
	return bearerToken;
};
