import axios from "axios";

export class AutumnCli {
  public apiKey: string;
  public baseUrl: string;
  public authHeader: any;

  constructor() {
    this.apiKey = process.env.AUTUMN_API_KEY || "";
    this.baseUrl = "https://api.useautumn.com/v1";
    this.authHeader = {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async entitled({
    customerId,
    featureId,
    quantity = 1,
  }: {
    customerId: string;
    featureId: string;
    quantity?: number;
  }) {
    try {
      const { data } = await axios.get(
        `${this.baseUrl}/entitled?customer_id=${customerId}&feature_id=${featureId}&quantity=${quantity}`,
        {
          headers: this.authHeader,
        }
      );

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.response.data };
    }
  }

  async sendEvent({
    customerId,
    eventName,
  }: {
    customerId: string;
    eventName: string;
  }) {
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/events`,
        {
          customer_id: customerId,
          event_name: eventName,
        },
        {
          headers: this.authHeader,
        }
      );

      return { data, error: null };
    } catch (error: any) {
      console.error("Failed to send event", error);
      return { data: null, error: error.response.data };
    }
  }
}
