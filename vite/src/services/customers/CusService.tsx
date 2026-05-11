import type {
	DbOverageAllowed,
	DbSpendLimit,
	DbUsageAlert,
} from "@autumn/shared";
import type { AxiosInstance } from "axios";

export class CusService {
	static async createCustomer(axios: AxiosInstance, data: any) {
		return await axios.post("/v1/customers?with_autumn_id=true", data);
	}

	static async deleteCustomer(axios: AxiosInstance, customer_id: any) {
		await axios.delete(`/v1/customers/${customer_id}`);
	}

	static async attach(axios: AxiosInstance, data: any) {
		return await axios.post(`/v1/attach`, {
			...data,
		});
	}

	static async updateCustomer({
		axios,
		customer_id,
		data,
	}: {
		axios: AxiosInstance;
		customer_id: string;
		data: any;
	}) {
		return await axios.post(`/v1/customers/${customer_id}`, data);
	}

	static async updateEntity({
		axios,
		customerId,
		entityId,
		billingControls,
	}: {
		axios: AxiosInstance;
		customerId: string;
		entityId: string;
		billingControls: {
			spend_limits?: DbSpendLimit[];
			usage_alerts?: DbUsageAlert[];
			overage_allowed?: DbOverageAllowed[];
		};
	}) {
		return await axios.post("/v1/entities.update", {
			customer_id: customerId,
			entity_id: entityId,
			billing_controls: billingControls,
		});
	}

	static async getProductOptions(axios: AxiosInstance, data: any) {
		return await axios.post(`/customers/product_options`, {
			...data,
		});
	}

	static async updateCusEntitlement(
		axios: AxiosInstance,
		customer_id: string,
		customer_entitlement_id: string,
		data: any,
	) {
		return await axios.post(
			`/v1/customers/${customer_id}/entitlements/${customer_entitlement_id}`,
			data,
		);
	}

	static async updateCusProductStatus(
		axios: AxiosInstance,
		customer_product_id: string,
		data: any,
	) {
		return await axios.post(
			`/v1/customers/customer_products/${customer_product_id}`,
			data,
		);
	}

	static async addCouponToCustomer({
		axios,
		customer_id,
		coupon_id,
		promo_code,
	}: {
		axios: AxiosInstance;
		customer_id: string;
		coupon_id: string;
		promo_code?: string;
	}) {
		return await axios.post(
			`/v1/customers/${customer_id}/coupons/${coupon_id}`,
			promo_code ? { promo_code } : {},
		);
	}

	static async createBillingPortalSession({
		axios,
		customer_id,
	}: {
		axios: AxiosInstance;
		customer_id: string;
	}): Promise<{ customer_id: string | null; url: string }> {
		const { data } = await axios.post(
			`/v1/customers/${customer_id}/billing_portal`,
		);
		return data;
	}
}
