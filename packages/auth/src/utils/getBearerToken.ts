const BEARER_PREFIX = "Bearer ";

export const getBearerToken = ({
	headers,
}: {
	headers: Headers;
}): string | undefined => {
	const authorization = headers.get("authorization");
	if (!authorization?.startsWith(BEARER_PREFIX)) return undefined;

	const token = authorization.slice(BEARER_PREFIX.length).trim();
	return token.length ? token : undefined;
};
