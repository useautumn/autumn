// Re-export functions from setupUtils
export { clearOrg } from "./setup/clearOrg.js";
export { getAxiosInstance, setupOrg } from "./setup/setupOrg.js";

import axios from "axios";

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
		baseURL: process.env.AUTUMN_TEST_BASE_URL || "http://localhost:8080",
		headers: headers,
	});
};
