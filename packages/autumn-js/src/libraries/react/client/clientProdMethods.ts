import type Autumn from "@sdk";
import type { AutumnClient } from "./ReactAutumnClient";

export async function listProductsMethod(
	this: AutumnClient,
): Promise<Autumn.Products.ProductListResponse> {
	const res = await this.get(`${this.prefix}/products`);
	return res;
}
