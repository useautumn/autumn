export enum DBConnectionProvider {
  Postgres = "postgres",
}

export interface DBConnection {
  id: string;
  org_id: string;
  provider: DBConnectionProvider;
  display_name: string;
  connection_string: string;
  created_at: number;
}
