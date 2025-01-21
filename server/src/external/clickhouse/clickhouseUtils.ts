import { createClient } from "@clickhouse/client";

export const createClickhouseCli = () =>
  createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USERNAME,
    password: process.env.CLICKHOUSE_PASSWORD,
  });

const test = async () => {
  const clickhouseClient = createClickhouseCli();
  const rows = await clickhouseClient.query({
    query: "SELECT 1",
    format: "JSONEachRow",
  });
  console.log("Result: ", await rows.json());
};
