import type { AxiosInstance } from "axios";

export class DevService {
	static async createAPIKey(
		axiosInstance: AxiosInstance,
		data: { name: string; scopes?: string[]; hidden?: boolean },
	) {
		const { data: resBody } = await axiosInstance.post("/dev/api_key", data);
		return resBody;
	}

	static async listHiddenAPIKeys(axiosInstance: AxiosInstance) {
		const { data: resBody } = await axiosInstance.get("/dev/api_key/hidden");
		return resBody.api_keys;
	}

	static async deleteAPIKey(axiosInstance: AxiosInstance, id: string) {
		const { data: resBody } = await axiosInstance.delete(`/dev/api_key/${id}`);
		return resBody;
	}
}
