import { createClient } from "@supabase/supabase-js";
import fetchRetry from "fetch-retry";

// Wrap the global fetch with fetch-retry
const fetchWithRetry = fetchRetry(fetch, {
  retries: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000), // Exponential backoff starting at 1s, max 30s
  retryOn: (attempt, error, response) => {
    // Retry on gateway errors (502) and Cloudflare errors (520)
    let shouldRetry = false;
    try {
      if (
        error?.message?.includes("cloudflare") ||
        error?.message?.includes("TypeError: fetch failed")
      ) {
        shouldRetry = true;
      }
    } catch (error) {}

    if (
      (response && (response.status === 502 || response.status === 520)) ||
      shouldRetry
    ) {
      console.warn(
        `Retrying request... Attempt #${attempt + 1} - Status: ${
          response?.status
        }`
      );
      return true;
    }

    return false;
  },
});

export const createSupabaseClient = () => {
  try {
    return createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        global: {
          fetch: fetchWithRetry,
        },
      }
    );
  } catch (error) {
    console.error("Error creating Supabase client:", error);
    throw error;
  }
};

export const sbWithRetry = async ({
  query,
  retries = 3,
  logger,
}: {
  query: () => Promise<any>;
  retries?: number;
  logger?: any;
}) => {
  if (!logger) {
    logger = console;
  }

  // Trying out fetch-retry
  return await query();

  for (let i = 0; i < retries; i++) {
    let { data, error } = await query();

    let gatewayError =
      error && typeof error === "string" && error.includes("gateway error");
    let cloudflareError =
      error && error.message && error.message.includes(`Bad Gateway`);
    let typeError =
      error && error.message && error.message == "TypeError: fetch failed";

    let shouldRetry =
      (gatewayError || cloudflareError || typeError) && i < retries - 1;

    if (shouldRetry) {
      logger.warn(
        `Attempt ${i + 1}: Supabase internal error (${
          gatewayError ? "gateway error" : "cloudflare error"
        }), retrying...`
      );

      logger.warn("Error", { error });

      await new Promise((resolve) => setTimeout(resolve, 400));
    } else {
      if (error) {
        logger.info(
          `Attempt ${i + 1}: max retries reached (or different error)`
        );
        logger.info("Error", { error });
      } else if (i > 0) {
        logger.info(`Attempt ${i + 1}: succeeded`);
        logger.info("Data", { data });
      }
      return { data, error };
    }
  }

  return { data: null, error: new Error("Failed to execute function") };
};
