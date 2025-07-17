import fs from "fs";
import path from "path";
import { ClickHouseClient, QueryParams } from "@clickhouse/client";
import { clickhouseClient } from "../../db/initClickHouse.js";

export enum ClickHouseQuery {
  CREATE_DATE_RANGE_VIEW = "CREATE_DATE_RANGE_VIEW",
  CREATE_DATE_RANGE_BC_VIEW = "CREATE_DATE_RANGE_BC_VIEW",
  CREATE_ORG_EVENTS_VIEW = "CREATE_ORG_EVENTS_VIEW",
  CREATE_GENERATE_EVENT_COUNT_EXPRESSIONS_FUNCTION = "CREATE_GENERATE_EVENT_COUNTS_EXPRESSIONS",
  GENERATE_EVENT_COUNT_EXPRESSIONS = "GENERATE_EVENT_COUNT_EXPRESSIONS",
  ENSURE_VIEWS_EXIST = "ENSURE_VIEWS_EXIST",
  ENSURE_FUNCTIONS_EXIST = "ENSURE_FUNCTIONS_EXIST",
}

export class ClickHouseManager {
  private static instance: ClickHouseManager | null = null;
  private client: ClickHouseClient | null = clickhouseClient;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // Empty private constructor
  }

  private async initializeClickHouse(): Promise<void> {
    console.log("Initializing ClickHouse Manager...");
    console.group();
    if (this.initialized) {
      console.log("0. ClickHouse Manager already initialized.");
      console.groupEnd();
      return;
    }

    console.log("1. Creating ClickHouse client...");
    this.client = clickhouseClient;

    // console.log("2. Checking SQL files exist...");
    // await ClickHouseManager.ensureSQLFilesExist();

    // console.log("3. Ensuring queries exist...");
    // await this.ensureQueriesExist();

    console.log("4. ClickHouse Manager initialized.");
    console.groupEnd();

    this.initialized = true;
  }

  public static async getInstance(): Promise<ClickHouseManager> {
    if (!ClickHouseManager.instance) {
      ClickHouseManager.instance = new ClickHouseManager();
      ClickHouseManager.instance.initPromise =
        ClickHouseManager.instance.initializeClickHouse();
    }

    // Wait for initialization to complete
    if (ClickHouseManager.instance.initPromise) {
      await ClickHouseManager.instance.initPromise;
    }

    return ClickHouseManager.instance;
  }

  public static async getClient(): Promise<ClickHouseClient> {
    const manager = await ClickHouseManager.getInstance();
    if (!manager.client) {
      throw new Error("ClickHouse client not initialized");
    }
    return manager.client;
  }

  static async createDateRangeView() {}
  static async createDateRangeBcView() {}
  static async createOrgEventsView() {}

  static async ensureSQLFilesExist() {
    const requiredQueries = [
      ClickHouseQuery.CREATE_DATE_RANGE_VIEW,
      ClickHouseQuery.CREATE_DATE_RANGE_BC_VIEW,
      ClickHouseQuery.CREATE_ORG_EVENTS_VIEW,
      ClickHouseQuery.CREATE_GENERATE_EVENT_COUNT_EXPRESSIONS_FUNCTION,
      ClickHouseQuery.GENERATE_EVENT_COUNT_EXPRESSIONS,
      ClickHouseQuery.ENSURE_VIEWS_EXIST,
      ClickHouseQuery.ENSURE_FUNCTIONS_EXIST,
    ];

    const queryResults = await Promise.allSettled(
      requiredQueries.map((query) => ClickHouseManager.readSQLFile(query))
    );

    const failedQueries = queryResults.filter(
      (result) => result.status === "rejected"
    );

    if (failedQueries.length > 0) {
      console.error(
        `Failed to read ${failedQueries.length} ClickHouse queries. Please re-pull the latest version of Autumn. `
      );
      failedQueries.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `Query ${requiredQueries[index]} failed:`,
            result.reason
          );
        }
      });
      process.exit(1);
    }
  }

  private async ensureQueriesExist() {
    if (!this.client) {
      throw new Error("ClickHouse client not initialized");
    }

    // Check if we should skip ensuring queries exist
    if (process.env.CLICKHOUSE_SKIP_ENSURES?.toLowerCase() === "true") {
      console.group();
      console.log(
        "✓ Skipping query ensures - queries assumed to exist already"
      );
      console.groupEnd();
      return;
    }

    const queries = [
      ClickHouseQuery.CREATE_DATE_RANGE_BC_VIEW,
      ClickHouseQuery.CREATE_DATE_RANGE_VIEW,
      ClickHouseQuery.CREATE_ORG_EVENTS_VIEW,
      ClickHouseQuery.CREATE_GENERATE_EVENT_COUNT_EXPRESSIONS_FUNCTION,
    ];

    console.group();

    await Promise.all(
      queries.map(async (query) => {
        try {
          await this.executeQuery(query, this.client!);
          console.log(`✓ Successfully ensured query ${query} exists.`);
        } catch (error) {
          console.error(`✗ Failed to execute query ${query}:`, error);
          process.exit(1);
        }
      })
    );

    console.groupEnd();
  }

  private async readSQLFile(query: ClickHouseQuery) {
    const queriesDir = path.join(import.meta.dirname, "queries");
    const queryPath = path.join(queriesDir, `${query}.sql`);
    const queryContent = fs.readFileSync(queryPath, "utf8");
    return queryContent;
  }

  static async readSQLFile(query: ClickHouseQuery) {
    const manager = await ClickHouseManager.getInstance();
    return manager.readSQLFile(query);
  }

  private async executeQuery(
    query: ClickHouseQuery,
    client: ClickHouseClient,
    options: any = {}
  ) {
    const queryContent = await this.readSQLFile(query);
    if (!queryContent) {
      throw new Error(`Query ${query} not found`);
    }

    // For CREATE FUNCTION queries, use command() instead of query() to avoid FORMAT clause
    if (
      query === ClickHouseQuery.CREATE_GENERATE_EVENT_COUNT_EXPRESSIONS_FUNCTION
    ) {
      const result = await client.command({
        query: queryContent,
        ...options,
      });
      return result;
    }

    const result = await client.query({
      query: queryContent,
      ...options,
    });
    return result;
  }

  static async executeQuery(
    query: ClickHouseQuery,
    client?: ClickHouseClient,
    options: QueryParams = {
      format: "TabSeparatedRaw",
    } as QueryParams
  ) {
    const manager = await ClickHouseManager.getInstance();
    const clickhouseClient = client || (await ClickHouseManager.getClient());
    return manager.executeQuery(query, clickhouseClient, options);
  }
}
