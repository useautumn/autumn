export interface Expression {
  property: string;
  operator: string;
  value: string[];
}

export interface Aggregate {
  type: string;
  property: string | null;
}

export interface GroupBy {
  property: string;
}

export interface MeteredConfig {
  filters: Expression[];
  aggregate: Aggregate;
  group_by?: GroupBy;
}
