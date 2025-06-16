import { Router } from "express";

export const userRouter: Router = Router();

userRouter.get("", async (req: any, res) => {
  res.status(200).json({ userId: req.userId });
});
