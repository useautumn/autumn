import type { CreateReward } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { getAxiosInstance } from "../utils/setup.js";

const handleAxiosError = (error: any) => {
	if (error.response.data) {
		throw new RecaseError({
			message: error.response.data.message,
			code: error.response.data.code,
			statusCode: error.response.data.statusCode,
		});
	}
	throw error;
};

export class AutumnCli {
	static async initStripeProducts() {
		const axiosInstance = getAxiosInstance();
		const { data } = await axiosInstance.post(`/v1/products/all/init_stripe`);
		return data;
	}

	static async getCustomer(customerId: string, params?: any) {
		try {
			const axiosInstance = getAxiosInstance();
			const { data } = await axiosInstance.get(`/v1/customers/${customerId}`, {
				params,
			});
			return data;
		} catch (error) {
			handleAxiosError(error);
		}
	}

	static async entitled(
		customerId: string,
		featureId: string,
		getBalance: boolean = false,
		group?: string,
	) {
		try {
			const axiosInstance = getAxiosInstance();
			const { data } = await axiosInstance.post(`/v1/entitled`, {
				customer_id: customerId,
				feature_id: featureId,
				group,
			});

			if (getBalance) {
				return {
					allowed: data.allowed,
					balanceObj: data.balances.find(
						(b: any) => b.feature_id === featureId,
					),
				};
			} else {
				return data as {
					allowed: boolean;
					balances: {
						feature_id: string;
						balance: number;
						required: number;
						unlimited: boolean;
						usage_allowed: boolean;
					}[];
				};
			}
		} catch (error) {
			handleAxiosError(error);
		}
	}

	static async attach({
		customerId,
		productId,
		productIds,
		options,
		forceCheckout,
	}: {
		customerId: string;
		productId?: string;
		productIds?: string[];
		options?: any;
		forceCheckout?: boolean;
	}) {
		try {
			const axiosInstance = getAxiosInstance();
			const { data } = await axiosInstance.post(`/v1/attach`, {
				customer_id: customerId,
				product_id: productId,
				product_ids: productIds,
				options,
				force_checkout: forceCheckout,
			});

			return data;
		} catch (error) {
			handleAxiosError(error);
		}
	}

	static async sendEvent({
		customerId,
		eventName,
		featureId,
		properties,
	}: {
		customerId: string;
		eventName?: string;
		featureId?: string;
		properties?: any;
	}) {
		try {
			const axiosInstance = getAxiosInstance();
			const { data } = await axiosInstance.post(`/v1/events`, {
				customer_id: customerId,
				event_name: eventName,
				feature_id: featureId,
				properties,
			});

			return data;
		} catch (error) {
			handleAxiosError(error);
		}
	}

	static async usage({
		customerId,
		featureId,
		value,
	}: {
		customerId: string;
		featureId: string;
		value: number;
	}) {
		try {
			const axiosInstance = getAxiosInstance();
			await axiosInstance.post(`/v1/usage`, {
				customer_id: customerId,
				feature_id: featureId,
				value,
			});
		} catch (error) {
			handleAxiosError(error);
		}
	}

	static async expire(customerProductId: string) {
		try {
			const axiosInstance = getAxiosInstance();
			const { data } = await axiosInstance.post(
				`/v1/customers/customer_products/${customerProductId}`,
				{
					status: "expired",
				},
			);

			return data;
		} catch (error) {
			handleAxiosError(error);
		}
	}

	static async updateCusEntitlement({
		customerId,
		entitlementId,
		balance,
	}: {
		customerId: string;
		entitlementId: string;
		balance: number;
	}) {
		try {
			const axiosInstance = getAxiosInstance();
			const { data } = await axiosInstance.post(
				`/v1/customers/${customerId}/customer_entitlements/${entitlementId}`,
				{
					balance,
				},
			);

			return data;
		} catch (error) {
			handleAxiosError(error);
		}
	}

	static async updateBalances({
		customerId,
		balances,
	}: {
		customerId: string;
		balances: any;
	}) {
		try {
			const axiosInstance = getAxiosInstance();
			const { data } = await axiosInstance.post(
				`/v1/customers/${customerId}/balances`,
				{
					balances,
				},
			);

			return data;
		} catch (error) {
			handleAxiosError(error);
		}
	}

	static async getProducts() {
		const axiosInstance = getAxiosInstance();
		const { data } = await axiosInstance.get(`/v1/products?v1_schema=true`);
		return data;
	}

	static async createCoupon(coupon: CreateReward) {
		const axiosInstance = getAxiosInstance();
		const { data } = await axiosInstance.post(`/v1/coupons`, coupon);
		return data;
	}
}
