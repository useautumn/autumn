import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { Router } from "express";

export const userRouter = Router();

userRouter.get("", async (req: any, res) => {
  const supabase = createSupabaseClient();

  res.status(200).json({ userId: req.userId });
  // const { data, error } = await supabase
  //   .from("users")
  //   .select("id, email, initialized")
  //   .eq("id", req.userId)
  //   .single();

  // if (error) {
  //   console.error("Error fetching user data:", error);
  //   res.status(500).json({ error: error.message });
  //   return;
  // }

  // res.status(200).json(data);
});
