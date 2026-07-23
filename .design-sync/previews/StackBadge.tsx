import { StackBadge } from "@autumn/ui";
import {
	AtomIcon,
	CubeIcon,
	FileTsIcon,
	LightningIcon,
	TriangleIcon,
} from "@phosphor-icons/react";

export const Default = () => (
	<div className="flex flex-wrap items-center gap-2">
		<StackBadge icon={<AtomIcon size={14} weight="fill" />} stack="React" />
		<StackBadge icon={<TriangleIcon size={14} weight="fill" />} stack="Next.js" />
		<StackBadge icon={<FileTsIcon size={14} weight="fill" />} stack="TypeScript" />
	</div>
);

export const Selected = () => (
	<div className="flex flex-wrap items-center gap-2">
		<StackBadge
			icon={<AtomIcon size={14} weight="fill" />}
			isSelected
			onClick={() => {}}
			stack="React"
		/>
		<StackBadge
			icon={<TriangleIcon size={14} weight="fill" />}
			onClick={() => {}}
			stack="Next.js"
		/>
		<StackBadge
			icon={<CubeIcon size={14} weight="fill" />}
			onClick={() => {}}
			stack="Node.js"
		/>
	</div>
);

export const IntegrationPicker = () => (
	<div className="flex flex-col gap-2">
		<span className="text-muted-foreground text-sm">
			Which stack are you installing Autumn into?
		</span>
		<div className="flex flex-wrap items-center gap-2">
			<StackBadge
				icon={<TriangleIcon size={14} weight="fill" />}
				isSelected
				onSelectedChange={() => {}}
				stack="Next.js"
			/>
			<StackBadge
				icon={<LightningIcon size={14} weight="fill" />}
				onSelectedChange={() => {}}
				stack="Hono"
			/>
			<StackBadge
				icon={<CubeIcon size={14} weight="fill" />}
				onSelectedChange={() => {}}
				stack="Express"
			/>
		</div>
	</div>
);
