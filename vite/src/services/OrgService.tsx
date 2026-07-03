import type { ChatAuthMode, UpsertVercelProcessorConfig } from "@autumn/shared";
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

	static async disconnectStripe(
		axiosInstance: AxiosInstance,
		channel?: "secret_key" | "oauth",
	) {
		return await axiosInstance.delete(`/v1/organization/stripe`, {
			data: channel ? { channel } : undefined,
		});
	}

	static async upsertVercelConfig(
		axiosInstance: AxiosInstance,
		data: UpsertVercelProcessorConfig,
	) {
		return await axiosInstance.patch(`/v1/organization/vercel`, data);
	}

	static async getChat(axiosInstance: AxiosInstance) {
		return await axiosInstance.get(`/organization/chat`);
	}

	static async createChatInstall(
		axiosInstance: AxiosInstance,
		data: {
			provider: "slack";
			env: string;
			mode?: ChatAuthMode;
			scopes?: string[];
		},
	) {
		return await axiosInstance.post(`/organization/chat/install`, data);
	}

	static async disconnectChat(axiosInstance: AxiosInstance, provider: "slack") {
		return await axiosInstance.delete(`/organization/chat/${provider}`);
	}
}
