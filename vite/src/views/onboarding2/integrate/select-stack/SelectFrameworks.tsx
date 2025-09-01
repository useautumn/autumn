import { Building, CircleUserRound, Code, Fingerprint } from "lucide-react";
import { useIntegrateContext } from "../IntegrateContext";
import { Backend, Frontend } from "../StackEnums";

export const SelectFrameworks = () => {
	const { queryStates, setQueryStates } = useIntegrateContext();

	const iconSize = 12;
	const frontendOptions = [
		{ value: Frontend.Nextjs, label: "Next.js", logo: "nextjs.png" },
		{ value: Frontend.ReactRouter, label: "RR7", logo: "react-router.svg" },
		{ value: Frontend.Vite, label: "Vite SPA", logo: "vite.svg" },
		{
			value: Frontend.Other,
			label: "Other",
			icon: <Code size={iconSize} className="text-t2" />,
		},
	];

	const backendOptions = [
		{ value: Backend.Nextjs, label: "Next.js", logo: "nextjs.png" },
		{
			value: Backend.ReactRouter,
			label: "RR7",
			logo: "react-router.svg",
		},
		{ value: Backend.Hono, label: "Hono", logo: "hono.png" },
		{ value: Backend.Express, label: "Express", logo: "express.png" },
		{ value: Backend.Elysia, label: "Elysia", logo: "elysia.png" },
		{
			value: Backend.Other,
			label: "Other",
			icon: <Code size={iconSize} className="text-t2" />,
		},
	];

	const authOptions = [
		{ value: "better_auth", label: "Better Auth", logo: "better-auth.png" },
		{ value: "supabase", label: "Supabase", logo: "supabase.png" },
		{ value: "clerk", label: "Clerk", logo: "clerk.png" },
		{
			value: "other",
			label: "Other",
			icon: <Fingerprint size={iconSize} className="text-t2" />,
		},
	];

	const customerOptions = [
		{
			value: "user",
			label: "Users",
			icon: <CircleUserRound size={iconSize} className="text-t2" />,
		},
		{
			value: "org",
			label: "Orgs",
			icon: <Building size={iconSize} className="text-t2" />,
		},
	];
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium text-t2">Frontend</label>
				<div className="flex flex-row gap-2">
					{frontendOptions.map((option) => {
						return (
							<FrameworkContainer
								option={option}
								setQueryStates={setQueryStates}
								queryStates={queryStates}
								type="frontend"
							/>
						);
					})}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium text-t2">Backend</label>
				<div className="flex flex-row gap-2">
					{backendOptions.map((option) => {
						return (
							<FrameworkContainer
								option={option}
								setQueryStates={setQueryStates}
								queryStates={queryStates}
								type="backend"
							/>
						);
					})}
				</div>
			</div>

			<div className="flex w-full justify-between">
				<div className="flex flex-col gap-2">
					<label className="text-sm font-medium text-t2">Auth Provider</label>
					<div className="flex flex-row gap-2">
						{authOptions.map((option) => {
							return (
								<FrameworkContainer
									option={option}
									setQueryStates={setQueryStates}
									queryStates={queryStates}
									type="auth"
								/>
							);
						})}
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<label className="text-sm font-medium text-t2">Customer Type</label>
					<div className="flex flex-row gap-2">
						{customerOptions.map((option) => {
							return (
								<FrameworkContainer
									option={option}
									setQueryStates={setQueryStates}
									queryStates={queryStates}
									type="customerType"
								/>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
};

const FrameworkContainer = ({
	option,
	setQueryStates,
	queryStates,
	type,
}: {
	option: {
		value: string;
		label: string;
		logo?: string;
		icon?: React.ReactNode;
	};
	setQueryStates: (queryStates: any) => void;
	queryStates: any;
	type: "backend" | "auth" | "customerType" | "frontend";
}) => {
	const isSelected = queryStates[type] === option.value;
	return (
		<div
			key={option.value}
			className={`flex text-sm justify-center items-center gap-2 h-8 px-2 rounded-xs cursor-pointer ${
				isSelected
					? "shadow-inner bg-stone-100 border border-zinc-200"
					: "border border-transparent"
			}`}
			onClick={() => setQueryStates({ ...queryStates, [type]: option.value })}
		>
			{option.logo ? (
				<img
					src={`/frameworks/${option.logo}`}
					alt={option.label}
					className="w-3 h-3"
				/>
			) : option.icon ? (
				option.icon
			) : (
				<Code className="text-t2" />
			)}
			<span className="text-t2 text-sm font-medium whitespace-nowrap">
				{option.label}
			</span>
		</div>
	);
};
