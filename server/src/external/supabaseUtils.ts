import { createClient } from "@supabase/supabase-js";

export const createSupabaseClient = () => {
  try {
    return createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  } catch (error) {
    console.error("Error creating Supabase client:", error);
    throw error;
  }
};

// export const downloadFileToTmp = async (
//   filePath: string,
//   localPath: string
// ) => {
//   const supabase = createSupabaseClient();

//   const { data, error } = await supabase.storage
//     .from(BUCKET_NAME)
//     .download(filePath);

//   if (error) {
//     throw new Error(`Failed to download file from Supabase: ${error.message}`);
//   }

//   if (!data) {
//     throw new Error("No data received from Supabase");
//   }

//   await writeFile(localPath, Buffer.from(await data.arrayBuffer()));
// };
