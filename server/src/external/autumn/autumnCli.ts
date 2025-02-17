import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";

export class Autumn {
  private apiKey: string;
  public headers: Record<string, string>;
  public baseUrl: string;

  constructor() {
    this.apiKey = process.env.AUTUMN_API_KEY || "";
    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    this.baseUrl = "https://api.useautumn.com/v1";
  }

  async get(path: string) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers,
    });
    return response.json();
  }

  async post(path: string, body: any) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (response.status != 200) {
      try {
        const error = await response.json();

        throw new RecaseError({
          message: "Failed to call Autumn API",
          code: ErrCode.InternalError,
          data: error,
        });
      } catch (error) {
        throw new RecaseError({
          message: "Failed to call Autumn API",
          code: ErrCode.InternalError,
          data: error,
        });
      }
    }

    return response.json();
  }

  async createCustomer({
    id,
    email,
    name,
    fingerprint,
  }: {
    id: string;
    email: string;
    name: string;
    fingerprint?: string;
  }) {
    const data = await this.post("/customers", {
      id,
      email,
      name,
      fingerprint,
    });

    return data;
  }

  async attach({
    customerId,
    productId,
    options,
  }: {
    customerId: string;
    productId: string;
    options?: any;
  }) {
    const data = await this.post(`/attach`, {
      customer_id: customerId,
      product_id: productId,
      options,
    });

    return data;
  }

  async sendEvent({
    customerId,
    eventName,
    properties,
    customer_data,
    idempotency_key,
  }: {
    customerId: string;
    eventName: string;
    properties?: any;
    customer_data?: any;
    idempotency_key?: string;
  }) {
    const data = await this.post(`/events`, {
      customer_id: customerId,
      event_name: eventName,
      properties,
      customer_data,
      idempotency_key,
    });

    return data;
  }

  async entitled({
    customerId,
    featureId,
    quantity,
    customer_data,
  }: {
    customerId: string;
    featureId: string;
    quantity?: number;
    customer_data?: any;
  }) {
    const data = await this.post(`/entitled`, {
      customer_id: customerId,
      feature_id: featureId,
      quantity,
      customer_data,
    });

    return data;
  }
}
