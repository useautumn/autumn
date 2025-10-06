import { CopyIcon } from "@phosphor-icons/react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { common, createStarryNight } from "@wooorm/starry-night";
import { toHtml } from "hast-util-to-html";
import * as React from "react";
import { cn } from "@/lib/utils";

const getStarryNight = async () => {
	return await createStarryNight(common);
};

const CodeGroup = TabsPrimitive.Root;

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
			"bg-white border border-[#d1d1d1] border-r-0",
			"text-[#444444] transition-none outline-none",
			"hover:text-[#8838ff]",
			"focus-visible:text-[#8838ff]",
			"data-[state=active]:bg-neutral-50 data-[state=active]:text-[#8838ff] data-[state=active]:shadow-[0px_3px_4px_0px_inset_rgba(0,0,0,0.04)]",
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
>(({ className, onCopy, ...props }, ref) => (
	<button
		ref={ref}
		type="button"
		onClick={onCopy}
		className={cn(
			"flex items-center justify-center h-6 px-2 py-1",
			"bg-white border border-[#d1d1d1] rounded-tr-md",
			"shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
			"hover:text-[#8838ff] transition-none outline-none",
			"focus-visible:text-[#8838ff]",
			className,
		)}
		{...props}
	>
		<CopyIcon className="size-[14px]" />
	</button>
));
CodeGroupCopyButton.displayName = "CodeGroupCopyButton";

interface CodeGroupContentProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {}

const CodeGroupContent = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Content>,
	CodeGroupContentProps
>(({ className, ...props }, ref) => (
	<TabsPrimitive.Content
		ref={ref}
		className={cn(
			"bg-white border border-[#d1d1d1] border-t-0 rounded-bl-lg rounded-br-lg",
			"p-4 outline-none",
			className,
		)}
		{...props}
	/>
));
CodeGroupContent.displayName = "CodeGroupContent";

interface CodeGroupCodeProps extends React.ComponentPropsWithoutRef<"pre"> {
	language?: string;
	children: string;
}

const CodeGroupCode = React.forwardRef<HTMLPreElement, CodeGroupCodeProps>(
	({ className, language = "jsx", children, ...props }, ref) => {
		const [highlightedCode, setHighlightedCode] = React.useState("");

		React.useEffect(() => {
			const highlight = async () => {
				try {
					const starryNight = await getStarryNight();
					const scope = starryNight.flagToScope(language);

					if (scope) {
						const tree = starryNight.highlight(children, scope);
						let html = toHtml(tree);

						// Post-process: mark operators (single/double char pl-k spans) differently from keywords
						// Operators to mark as grey: : = ! + - * / % & | ^ ~ < > ?
						html = html.replace(
							/<span class="pl-k">([!:=<>+\-*/%&|^~?]+|&gt;|&lt;|&amp;|=>|==|===|!==|!=|<=|>=|&&|\|\|)<\/span>/g,
							'<span class="pl-k pl-operator">$1</span>',
						);

						// Post-process: detect function declarations (pl-c1 followed by = async or = ()
						// Mark these as function names (should be red)
						html = html.replace(
							/<span class="pl-c1">([^<]+)<\/span>(\s*)<span class="pl-k pl-operator">=<\/span>(\s*)(<span class="pl-k">async<\/span>|[(])/g,
							'<span class="pl-c1 pl-function-name">$1</span>$2<span class="pl-k pl-operator">=</span>$3$4',
						);

						// Post-process: wrap property names in object literals (text before : that's not in a span)
						// Match word characters followed by a colon span
						html = html.replace(
							/([a-zA-Z_$][a-zA-Z0-9_$]*)(<span class="pl-k pl-operator">:<\/span>)/g,
							'<span class="pl-property">$1</span>$2',
						);

						// Post-process: wrap JSX tag names and attributes
						// Match tag names after < or </
						html = html.replace(
							/<span class="pl-k">&lt;(<\/)?<\/span>([a-zA-Z][a-zA-Z0-9]*)/g,
							'<span class="pl-k">&lt;$1</span><span class="pl-property">$2</span>',
						);

						// Match JSX attributes (word before = in JSX context)
						// Handles both with space and without space before attribute
						html = html.replace(
							/([>\s])([a-zA-Z][a-zA-Z0-9]*)(<span class="pl-k pl-operator">=<\/span>{)/g,
							'$1<span class="pl-property">$2</span>$3',
						);

						// Post-process: detect boolean values (true/false) and make them purple like strings
						html = html.replace(
							/<span class="pl-c1">(true|false)<\/span>/g,
							'<span class="pl-c1 pl-boolean">$1</span>',
						);

						setHighlightedCode(html);
					} else {
						setHighlightedCode(children);
					}
				} catch (error) {
					console.error("Syntax highlighting error:", error);
					setHighlightedCode(children);
				}
			};

			highlight();
		}, [children, language]);

		return (
			<pre
				ref={ref}
				className={cn(
					"code-group-highlight font-mono font-medium text-[13px] leading-[1.6] whitespace-pre-wrap overflow-auto",
					className,
				)}
				{...props}
			>
				<code
					className={cn(`language-${language}`)}
					dangerouslySetInnerHTML={{ __html: highlightedCode || children }}
				/>
			</pre>
		);
	},
);
CodeGroupCode.displayName = "CodeGroupCode";

export {
	CodeGroup,
	CodeGroupList,
	CodeGroupTab,
	CodeGroupCopyButton,
	CodeGroupContent,
	CodeGroupCode,
};
