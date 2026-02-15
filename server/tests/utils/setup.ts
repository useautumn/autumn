// Re-export functions from setupUtils
export { clearOrg } from "./setup/clearOrg.js";
export { getAxiosInstance, setupOrg } from "./setup/setupOrg.js";

import axios from "axios";

const BASE_URL = process.env.SERVER_URL || "http://localhost:8080";

export const getPublicAxiosInstance = ({
	withBearer,
	pkey = process.env.UNIT_TEST_AUTUMN_PUBLIC_KEY!,
}: {
	withBearer: boolean;
	pkey?: string;
}) => {
	const headers = withBearer
		? {
				Authorization: `Bearer ${pkey}`,
			}
		: {
				"x-publishable-key": pkey,
			};
	return axios.create({
		baseURL: BASE_URL,
		headers: headers,
	});
};
