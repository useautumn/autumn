export type CreditSchemaItem = {
  metered_feature_id: string;
  feature_amount: number;
  credit_amount: number;
};

// export type CreditSchema = {
//   items: CreditSchemaItem[];
// };

export type CreditSystemConfig = {
  schema: CreditSchemaItem[];
};

export type CreditSystem = {
  internal_id: string;
  org_id: string;
  id: string;
  name: string;
  created_at: number;
  config: CreditSystemConfig;
};
