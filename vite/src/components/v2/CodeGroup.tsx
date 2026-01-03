import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { useTheme } from "@/contexts/ThemeProvider";
import { useClickWithoutDrag } from "@/hooks/common/useClickWithoutDrag";
import { highlightCode } from "@/lib/shikiHighlighter";
import { cn } from "@/lib/utils";

interface CodeGroupProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {}

const CodeGroup = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Root>,
	CodeGroupProps
>(({ ...props }, ref) => <TabsPrimitive.Root ref={ref} {...props} />);
CodeGroup.displayName = "CodeGroup";

interface CodeGroupListProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {}

const CodeGroupList = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.List>,
	CodeGroupListProps
>(({ className, ...props }, ref) => (
	<TabsPrimitive.List
		ref={ref}
		className={cn("flex items-center w-full border-b-0 h-6", className)}
		{...props}
	/>
));
CodeGroupList.displayName = "CodeGroupList";

interface CodeGroupTabProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {}

const CodeGroupTab = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Trigger>,
	CodeGroupTabProps
>(({ className, ...props }, ref) => (
	<TabsPrimitive.Trigger
		ref={ref}
		className={cn(
			"flex items-center justify-center flex-1 min-w-0 h-6 px-2 py-1 text-[13px] font-semibold tracking-[-0.039px] leading-normal whitespace-nowrap",
			"bg-interactive-secondary border border-r-0",
			"text-t3 transition-none outline-none",
			"hover:text-primary",
			"focus-visible:text-primary",
			"data-[state=active]:bg-interactive-secondary-hover  data-[state=active]:shadow-[0px_3px_4px_0px_inset_rgba(0,0,0,0.04)]",
			"data-[state=inactive]:shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
			"first:rounded-tl-md first:border-l",
			className,
		)}
		{...props}
	/>
));
CodeGroupTab.displayName = "CodeGroupTab";

interface CodeGroupCopyButtonProps
	extends React.ComponentPropsWithoutRef<"button"> {
	onCopy?: () => void;
}

const CodeGroupCopyButton = React.forwardRef<
	HTMLButtonElement,
	CodeGroupCopyButtonProps
>(({ className, onCopy, ...props }, ref) => {
	const [copied, setCopied] = React.useState(false);

	const handleClick = React.useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			if (onCopy) onCopy();
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
			if (props.onClick) props.onClick(e);
		},
		[onCopy, props.onClick],
	);

	return (
		<button
			ref={ref}
			type="button"
			onClick={handleClick}
			className={cn(
				"flex items-center justify-center h-6 px-2 py-1",
				"bg-interactive-secondary border rounded-tr-md",
				"shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
				"hover:text-primary transition-none outline-none",
				"focus-visible:text-primary",
				className,
			)}
			aria-label={copied ? "Copied!" : "Copy code"}
			{...props}
		>
			{copied ? (
				<CheckIcon className="size-[14px] text-primary" />
			) : (
				<CopyIcon className="size-[14px]" />
			)}
		</button>
	);
});
CodeGroupCopyButton.displayName = "CodeGroupCopyButton";

interface CodeGroupContentProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {
	copyText?: string;
}

const CodeGroupContent = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Content>,
	CodeGroupContentProps
>(({ className, copyText, children, ...props }, ref) => {
	const [showCopiedFeedback, setShowCopiedFeedback] = React.useState(false);
	const [isExiting, setIsExiting] = React.useState(false);

	const handleCopy = React.useCallback(
		(_e: React.MouseEvent) => {
			// Get current selection
			const selection = window.getSelection();
			const selectedText = selection?.toString() || "";

			// Determine what to copy
			const textToCopy = selectedText || copyText || "";

			if (textToCopy) {
				navigator.clipboard.writeText(textToCopy);

				// Show feedback with fade in
				setIsExiting(false);
				setShowCopiedFeedback(true);

				// Start fade out after delay
				setTimeout(() => {
					setIsExiting(true);
				}, 1000);

				// Hide completely after fade out animation
				setTimeout(() => {
					setShowCopiedFeedback(false);
					setIsExiting(false);
				}, 1200);
			}
		},
		[copyText],
	);

	const { handleMouseDown, handleClick } = useClickWithoutDrag(handleCopy);

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				const textToCopy = copyText || "";
				if (textToCopy) {
					navigator.clipboard.writeText(textToCopy);
					setIsExiting(false);
					setShowCopiedFeedback(true);

					setTimeout(() => {
						setIsExiting(true);
					}, 1000);

					setTimeout(() => {
						setShowCopiedFeedback(false);
						setIsExiting(false);
					}, 1200);
				}
			}
		},
		[copyText],
	);

	return (
		<div className="relative">
			<TabsPrimitive.Content
				ref={ref}
				className={cn(
					"bg-white dark:bg-background border border-t-0 rounded-bl-lg rounded-br-lg",
					"p-4 outline-none",
					"cursor-pointer",
					className,
				)}
				onMouseDown={handleMouseDown}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
				aria-label="Click to copy code"
				{...props}
			>
				{children}
			</TabsPrimitive.Content>

			{showCopiedFeedback && (
				<div
					className={cn(
						"absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-bl-lg rounded-br-lg overflow-hidden",
						"transition-opacity duration-300",
						"opacity-0",
						!isExiting && "opacity-100",
					)}
				>
					<div className="absolute inset-0 bg-background/80 backdrop-blur-[2px]" />
					<div className="relative flex items-center gap-2 text-t2 text-sm font-medium">
						<CheckIcon className="size-4" />
						<span>Copied</span>
					</div>
				</div>
			)}
		</div>
	);
});
CodeGroupContent.displayName = "CodeGroupContent";

interface CodeGroupCodeProps extends React.ComponentPropsWithoutRef<"div"> {
	language?: string;
	children: string;
}

const CodeGroupCode = React.forwardRef<HTMLDivElement, CodeGroupCodeProps>(
	({ className, language = "jsx", children, ...props }, ref) => {
		const [highlightedCode, setHighlightedCode] = React.useState("");
		const { isDark } = useTheme();

		React.useEffect(() => {
			const highlight = async () => {
				try {
					const html = await highlightCode({
						code: children,
						language,
						isDark,
					});
					setHighlightedCode(html);
				} catch (error) {
					console.error("Syntax highlighting error:", error);
					setHighlightedCode(`<pre><code>${children}</code></pre>`);
				}
			};

			highlight();
		}, [children, language, isDark]);

		return (
			<div
				ref={ref}
				className={cn(
					"font-mono font-medium text-[13px] leading-[1.6] overflow-x-auto",
					className,
				)}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed"
				dangerouslySetInnerHTML={{ __html: highlightedCode || children }}
				{...props}
			/>
		);
	},
);
CodeGroupCode.displayName = "CodeGroupCode";

const CodeGroupCodeSolidColour = React.forwardRef<
	HTMLPreElement,
	React.ComponentPropsWithoutRef<"pre">
>(({ className, children, ...props }, ref) => {
	return (
		<pre ref={ref} className={cn("text-t8", className)} {...props}>
			{children}
		</pre>
	);
});
CodeGroupCodeSolidColour.displayName = "CodeGroupCodeSolidColour";

export {
	CodeGroup,
	CodeGroupList,
	CodeGroupTab,
	CodeGroupCopyButton,
	CodeGroupContent,
	CodeGroupCode,
	CodeGroupCodeSolidColour,
};
