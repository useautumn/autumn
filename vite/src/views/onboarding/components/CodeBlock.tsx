import Prism from "prismjs";
import "prism-themes/themes/prism-vsc-dark-plus.css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-go";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-dart";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-c";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import OptionButton from "./OptionButton";
import { CopyButton } from "./OptionButton";
// import OptionButton from './OptionButton'
// import CopyButton from '../CopyButton/CopyButton'

export type Language =
  | "javascript"
  | "go"
  | "python"
  | "typescript"
  | "ruby"
  | "dart"
  | "rust"
  | "json"
  | "c"
  | "bash";

export type CodeSnippetDetails = {
  title: string;
  language: Language;
  displayLanguage: Language;
  content: string;
};

interface CodeBlockProps {
  snippets: CodeSnippetDetails[];
  className?: string;
}

const CodeBlock = ({ snippets, className }: CodeBlockProps) => {
  const codeRef = useRef<HTMLElement | null>(null);
  const [index, setIndex] = useState(0);

  const selected = snippets[index];

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [snippets, selected]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-panel-border bg-code-background overflow-hidden",
        className
      )}
    >
      <div className="flex justify-between items-center bg-code-tabs">
        <div className="flex">
          {snippets.map((snippet, i) => (
            <OptionButton
              key={snippet.title}
              title={snippet.title}
              selected={selected === snippet}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <CopyButton content={selected.content} />
      </div>
      <div className="px-2  bg-code-bg overflow-x-auto">
        <pre
          key={`selected-${selected.language}`}
          className="text-[13px] leading-5 w-fit"
        >
          <code
            ref={codeRef}
            className={`language-${selected.displayLanguage}`}
          >
            {selected.content}
          </code>
        </pre>
      </div>
    </div>
  );
};

export default CodeBlock;
