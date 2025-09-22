import Application from "@/components/application";
import CustomerDetailsExample from "@/components/billing";
import Intro from "@/components/introduction";

export default function Home() {
	return (
		<div className="min-h-screen w-full p-6 flex flex-col gap-8 max-w-7xl mx-auto">
			<Intro />

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Application />
				<CustomerDetailsExample />
			</div>
		</div>
	);
}
