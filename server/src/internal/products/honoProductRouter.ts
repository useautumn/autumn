import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { createProduct } from "./handlers/handleCreateProduct.js";

// Create a Hono app for products
export const honoProductRouter = new Hono<HonoEnv>();

// POST /products - Create a product
honoProductRouter.post("", ...createProduct);
