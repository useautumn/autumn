import type { UpsertVercelProcessorConfig } from "@autumn/shared";
import type { AxiosInstance } from "axios";

export class OrgService {
	static async get(axiosInstance: AxiosInstance) {
		return await axiosInstance.get(`/organization`);
	}

	static async create(axiosInstance: AxiosInstance, data: any) {
		return await axiosInstance.post(`/organization`, data);
	}

	static async connectStripe(axiosInstance: AxiosInstance, data: any) {
		return await axiosInstance.post(`/v1/organization/stripe`, data);
	}

	static async disconnectStripe(axiosInstance: AxiosInstance) {
		return await axiosInstance.delete(`/v1/organization/stripe`);
	}

	static async upsertVercelConfig(
		axiosInstance: AxiosInstance,
		data: UpsertVercelProcessorConfig,
	) {
		return await axiosInstance.patch(`/v1/organization/vercel`, data);
	}
}
