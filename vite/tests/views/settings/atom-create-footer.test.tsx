import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/contexts/ThemeProvider", () => ({
	useTheme: () => ({ isDark: true }),
}));

const { AtomCloudSection } = await import(
	"../../../src/views/settings/sections/components/atom/AtomCloudSection"
);
const { useAtomSetupForm } = await import(
	"../../../src/views/settings/sections/components/atom/useAtomSetupForm"
);

/** The create step's markup with `instanceType` and a `volumeGib` preset picked. */
const renderCloudStep = ({
	instanceType,
	volumeGib,
}: {
	instanceType: string;
	volumeGib: number;
}) => {
	const CloudStep = () => {
		const form = useAtomSetupForm({
			cache: null,
			stackNameBase: "atom-example",
			startSetup: async () => ({}) as never,
			onStarted: () => {},
		});
		form.setFieldValue("instanceType", instanceType);
		form.setFieldValue("volume", { presetGib: volumeGib, customGib: "" });
		return <AtomCloudSection form={form} onContinue={() => {}} />;
	};
	return renderToStaticMarkup(<CloudStep />)
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ");
};

describe("the create step's footer", () => {
	test("sums up the picked configuration and its monthly estimate on one row", () => {
		const text = renderCloudStep({ instanceType: "c8g.xlarge", volumeGib: 50 });
		expect(text).toContain("Medium · 50 GiB · 2 replicas");
		expect(text).toContain("$241/mo est.");
	});

	test("follows the picked size and storage", () => {
		const text = renderCloudStep({
			instanceType: "c8g.2xlarge",
			volumeGib: 20,
		});
		expect(text).toContain("Large · 20 GiB · 2 replicas");
		expect(text).toContain("$469/mo est.");
	});

	test("drops the old three-line cost text", () => {
		const text = renderCloudStep({ instanceType: "c8g.xlarge", volumeGib: 50 });
		expect(text).not.toContain("Runs 2 replicas for high availability");
		expect(text).not.toContain("≈");
	});
});
