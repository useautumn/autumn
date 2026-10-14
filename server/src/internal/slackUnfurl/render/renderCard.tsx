import { render } from "takumi-js";
import type { CustomerCardData } from "../data/types.js";
import { CARD_WIDTH, CustomerCard } from "./CustomerCard.js";
import { theme } from "./theme.js";

export async function renderCustomerCardPng(
	data: CustomerCardData,
): Promise<Uint8Array> {
	const result = await render(<CustomerCard data={data} />, {
		width: CARD_WIDTH,
		loadDefaultFonts: true,
	});
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

const GAP = 24;
const PAD = 24;

export async function renderCustomerCardsPng(
	datas: CustomerCardData[],
): Promise<Uint8Array> {
	if (datas.length === 0) {
		throw new Error("renderCustomerCardsPng: datas must not be empty");
	}
	if (datas.length === 1) return renderCustomerCardPng(datas[0]);

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
