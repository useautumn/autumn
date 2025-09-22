import { readFile } from "@/external/supabase/storageUtils.js";
import { createSupabaseClient } from "@/external/supabaseUtils.js";

export const getTrmnlJson = async () => {
	let sb = createSupabaseClient();
	const file = await readFile({ bucket: "private", path: "trmnl.json" });
	const fileString = await file.text();
	const fileJson = JSON.parse(fileString);

	return fileJson as Record<string, string>;
};
