export const getS3BodyAsString = async ({
	body,
}: {
	body: { transformToString?: () => Promise<string> };
}) => {
	if (typeof body.transformToString === "function") {
		return await body.transformToString();
	}

	return await new Response(body as BodyInit).text();
};
