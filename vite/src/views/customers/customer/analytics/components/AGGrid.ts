import { themeQuartz } from "ag-grid-community";

export type Row =
  | {
      interval_start: string;
    }
  | {
      [key: string]: number;
    };

export interface IRow {
  timestamp: string;
  event_name: string;
  value: number;
  properties: any;
  idempotency_key: string;
  entity_id: string;
  customer_id: string;
}

export const autumnTheme = themeQuartz.withParams({
  fontFamily: {
    googleFont: "Inter",
  },
  headerFontFamily: {
    googleFont: "Inter",
  },
  cellFontFamily: {
    googleFont: "Inter",
  },
  rowHoverColor: "#eabfff"
});