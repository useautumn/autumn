import type { ChatAuthMode, UpsertVercelProcessorConfig } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import type {
	CreateSsoConnectionParams,
	SsoCompleteResponse,
	SsoConnectionResponse,
} from "@/lib/sso/ssoTypes";

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

	static async getSso(axiosInstance: AxiosInstance) {
		return await axiosInstance.get<SsoConnectionResponse>(`/organization/sso`);
	}

	static async createSso(
		axiosInstance: AxiosInstance,
		data: CreateSsoConnectionParams,
	) {
		return await axiosInstance.post<SsoConnectionResponse>(
			`/organization/sso`,
			data,
		);
	}

	static async verifySsoDomain(axiosInstance: AxiosInstance) {
		return await axiosInstance.post<SsoConnectionResponse>(
			`/organization/sso/verify-domain`,
		);
	}

	static async deleteSso(axiosInstance: AxiosInstance) {
		return await axiosInstance.delete<{ success: true }>(`/organization/sso`);
	}

	static async testSso(axiosInstance: AxiosInstance) {
		return await axiosInstance.post<{ url: string }>(`/organization/sso/test`);
	}

	static async completeSso(
		axiosInstance: AxiosInstance,
		data: { providerId: string },
	) {
		return await axiosInstance.post<SsoCompleteResponse>(
			`/organization/sso/complete`,
			data,
		);
	}
}
