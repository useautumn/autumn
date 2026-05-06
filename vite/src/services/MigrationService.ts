import type { Migration } from "@autumn/shared";
import type { AxiosInstance } from "axios";

export const MigrationService = {
	list: async (axiosInstance: AxiosInstance) => {
		const { data } = await axiosInstance.post<{ list: Migration[] }>(
			"/migrations.list",
		);
		return data;
	},

	create: async (axiosInstance: AxiosInstance, body: { id: string }) => {
		const { data } = await axiosInstance.post<Migration>(
			"/migrations.create",
			body,
		);
		return data;
	},
};
