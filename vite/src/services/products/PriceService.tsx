import { AxiosInstance } from "axios";

export class PriceService {
	static async createPrice(axiosInstance: AxiosInstance, data: any) {
		await axiosInstance.post(`/v1/prices`, data);
	}

	static async deletePrice(axiosInstance: AxiosInstance, priceId: string) {
		await axiosInstance.delete(`/v1/prices/${priceId}`);
	}
}
