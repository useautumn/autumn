import { render } from "takumi-js";
import type { CustomerCardData } from "../data/types.js";
import { CARD_WIDTH, CustomerCard } from "./CustomerCard.js";
import { theme } from "./theme.js";

const CARD_WIDTH_PX = 1100;

/**
 * data -> PNG. Width is fixed for a predictable aspect; height is content-driven.
 */
export async function renderCustomerCardPng(
	data: CustomerCardData,
): Promise<Uint8Array> {
	const result = await render(<CustomerCard data={data} />, {
		width: CARD_WIDTH_PX,
		loadDefaultFonts: true,
	});
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

const GAP = 24;
const PAD = 24;

/**
 * Up to N cards composited into ONE PNG, side-by-side. A single card renders
 * exactly as before (no wrapper); multiple cards sit in a padded flex row.
 */
export async function renderCustomerCardsPng(
	datas: CustomerCardData[],
): Promise<Uint8Array> {
	if (datas.length <= 1) return renderCustomerCardPng(datas[0]);

	const width = datas.length * CARD_WIDTH + (datas.length - 1) * GAP + PAD * 2;
	const result = await render(
		<div
			style={{
				display: "flex",
				flexDirection: "row",
				alignItems: "flex-start",
				gap: GAP,
				padding: PAD,
				backgroundColor: theme.bg,
			}}
		>
			{datas.map((data) => (
				<CustomerCard key={data.customerId} data={data} />
			))}
		</div>,
		{ width, loadDefaultFonts: true },
	);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}
