import { createTinybirdApi } from "@tinybirdco/sdk";

const TINYBIRD_US_EAST_API_URL = process.env.TINYBIRD_US_EAST_API_URL;
const TINYBIRD_US_EAST_TOKEN = process.env.TINYBIRD_US_EAST_TOKEN;

/** Secondary Tinybird API client (us-east region) for dual-write during migration. */
export const tinybirdUsEastApi =
	TINYBIRD_US_EAST_API_URL && TINYBIRD_US_EAST_TOKEN
		? createTinybirdApi({
				baseUrl: TINYBIRD_US_EAST_API_URL,
				token: TINYBIRD_US_EAST_TOKEN,
			})
		: null;

if (tinybirdUsEastApi) {
	console.log(
		`[Tinybird] us-east dual-write configured with URL: ${TINYBIRD_US_EAST_API_URL}`,
	);
}
