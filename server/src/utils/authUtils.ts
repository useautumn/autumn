export const parseAuthHeader = (req: any) => {
	let authHeader = req.headers["Authorization"] || req.headers["authorization"];
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return null;
	}
	let bearerToken = authHeader.split(" ")[1];
	return bearerToken;
};
