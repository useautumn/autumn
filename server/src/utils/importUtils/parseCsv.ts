import { FeatureOptions } from "@autumn/shared";
import csvParser from "csv-parser";
import fs from "fs";

export interface ImportCustomer {
  id: string;
  name: string;
  email?: string;
  stripe_id: string;
  product_id: string;
  base_price?: number;
  options?: FeatureOptions[];
  // business_id;name;email;active_pass_count;Stripe id;Base price;free_trial_end
}
export const parseCsv = (slug: string): Promise<any[]> => {
  const path = `scripts/customers/${slug}/data.csv`;
  const results: ImportCustomer[] = [];

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(path);
    stream
      .pipe(csvParser({ separator: ";" }))
      .on("data", (data) =>
        results.push({
          id: data.business_id,
          name: data.name,
          email: data.email,
          stripe_id: data["Stripe id"],
          // base_price: data["Base price"],
          product_id: "standard_subscription",
          base_price: data["Base price"],
          options: [
            {
              feature_id: "active_passes",
              quantity: data["active_pass_count"],
            },
          ],
        }),
      )
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
};
