import { CreateRewardProgram, ErrCode } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import chalk from "chalk";

export default class AutumnError extends Error {
  message: string;
  code: string;

  constructor({ message, code }: { message: string; code: string }) {
    super(message);
    this.message = message;
    this.code = code;
  }

  toString(): string {
    return `${this.message} (code: ${this.code})`;
  }
}

export class Autumn {
  private apiKey: string;
  public headers: Record<string, string>;
  public baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.AUTUMN_API_KEY || "";

    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    // this.baseUrl = "https://api.useautumn.com/v1";
    this.baseUrl = baseUrl || "http://localhost:8080/v1";
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
      let error: any;
      try {
        error = await response.json();
      } catch (error) {
        throw new AutumnError({
          message: "Failed to parse Autumn API error response",
          code: ErrCode.InternalError,
        });
      }

      throw new AutumnError({
        message: error.message,
        code: error.code,
      });
    }

    return response.json();
  }

  async delete(path: string) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.headers,
    });

    if (response.status != 200) {
      let error: any;
      try {
        error = await response.json();
      } catch (error) {
        throw new AutumnError({
          message: "Failed to parse Autumn API error response",
          code: ErrCode.InternalError,
        });
      }

      throw new AutumnError({
        message: error.message,
        code: error.code,
      });
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

  customers = {
    get: async (customerId: string) => {
      const data = await this.get(`/customers/${customerId}`);
      return data;
    },

    create: async (customer: { id: string; email: string; name: string }) => {
      const data = await this.post(`/customers`, customer);
      return data;
    },
  };

  entities = {
    create: async (
      customerId: string,
      entity:
        | {
            id: string;
            name: string;
            featureId: string;
          }
        | {
            id: string;
            name: string;
            featureId: string;
          }[]
    ) => {
      let entities = Array.isArray(entity) ? entity : [entity];
      const data = await this.post(
        `/customers/${customerId}/entities`,
        entities.map((e: any) => {
          return {
            id: e.id,
            name: e.name,
            feature_id: e.featureId,
          };
        })
      );

      return data;
    },

    list: async (customerId: string) => {
      const data = await this.get(`/customers/${customerId}/entities`);
      return data;
    },

    delete: async (customerId: string, entityId: string) => {
      const data = await this.delete(
        `/customers/${customerId}/entities/${entityId}`
      );
      return data;
    },
  };

  products = {
    update: async (productId: string, product: any) => {
      if (product.items && typeof product.items === "object") {
        product.items = Object.values(product.items);
      }
      const data = await this.post(`/products/${productId}`, product);
      return data;
    },

    get: async (
      productId: string,
      { v1Schema = false }: { v1Schema?: boolean } = {}
    ) => {
      const data = await this.get(
        `/products/${productId}?${v1Schema ? "schemaVersion=1" : ""}`
      );
      return data;
    },

    create: async (product: any) => {
      const data = await this.post(`/products`, product);
      return data;
    },

    delete: async (productId: string) => {
      const data = await this.delete(`/products/${productId}`);
      return data;
    },
  };

  rewards = {
    create: async (reward: any) => {
      const data = await this.post(`/rewards`, reward);
      return data;
    },
  };

  rewardPrograms = {
    create: async (rewardProgram: CreateRewardProgram) => {
      const data = await this.post(`/reward_programs`, rewardProgram);
      return data;
    },
  };

  referrals = {
    createCode: async ({
      customerId,
      referralId,
    }: {
      customerId: string;
      referralId: string;
    }) => {
      const data = await this.post(`/referrals/code`, {
        customer_id: customerId,
        program_id: referralId,
      });
      return data;
    },
    redeem: async ({
      customerId,
      code,
    }: {
      customerId: string;
      code: string;
    }) => {
      const data = await this.post(`/referrals/redeem`, {
        customer_id: customerId,
        code,
      });
      return data;
    },
  };

  redemptions = {
    get: async ({ redemptionId }: { redemptionId: string }) => {
      const data = await this.get(`/redemptions/${redemptionId}`);
      return data;
    },
  };

  events = {
    send: async ({
      customerId,
      featureId,
      value,
    }: {
      customerId: string;
      featureId: string;
      value: number;
    }) => {
      const data = await this.post(`/events`, {
        customer_id: customerId,
        feature_id: featureId,
        value,
      });
      return data;
    },
  };

  initStripe = async () => {
    await this.post(`/products/all/init_stripe`, {});
  };
}
