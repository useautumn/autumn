import { expect, test } from "bun:test";
import { EDGE_CONFIG_SECTIONS } from "@/views/admin/components/edgeConfigCards";

const getShadowCard = () =>
	EDGE_CONFIG_SECTIONS.flatMap((section) => section.cards).find(
		(card) => String(card.id) === "balance-shadow",
	);

test.concurrent("edge config exposes the Balance Shadow editor", () => {
	expect(getShadowCard()).toMatchObject({
		id: "balance-shadow",
		title: "Balance Shadow",
		endpoint: "/admin/balance-shadow-config",
	});
});

test.concurrent(
	"shadow card distinguishes off, configured and expired runs",
	() => {
		const card = getShadowCard();
		expect(card?.deriveStatus({ enabled: false })).toEqual({
			label: "Off",
			tone: "neutral",
		});
		expect(
			card?.deriveStatus({
				enabled: true,
				run: { expiresAt: Date.now() + 60_000, customers: [{}, {}] },
			}),
		).toEqual({ label: "2 entries configured", tone: "active" });
		expect(
			card?.deriveStatus({
				enabled: true,
				run: { expiresAt: 1, customers: [{}] },
			}),
		).toEqual({ label: "Expired", tone: "warning" });
	},
);
