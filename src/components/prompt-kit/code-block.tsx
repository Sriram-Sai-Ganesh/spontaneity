"use client";

import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import React, { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CodeBlockProps = {
  children?: React.ReactNode;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-xl",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type CodeBlockCodeProps = {
  code: string;
  language?: string;
  theme?: string;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

function CodeBlockCode({
  code,
  language = "tsx",
  theme: themeProp,
  className,
  ...props
}: CodeBlockCodeProps) {
  const { resolvedTheme } = useTheme();
  const theme =
    themeProp ?? (resolvedTheme === "dark" ? "github-dark" : "github-light");
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Match Shiki pre background so horizontal scroll doesn't reveal a different color
  const themeBgClass =
    theme === "github-dark" ? "bg-[#24292e]" : "bg-[#f6f8fa]";

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      if (!code) {
        setHighlightedHtml("<pre><code></code></pre>");
        return;
      }

      try {
        const { codeToHtml } = await import("shiki");
        const html = await codeToHtml(code, { lang: language, theme });
        if (!cancelled) {
          setHighlightedHtml(html);
        }
      } catch {
        // Keep plaintext fallback when syntax highlighting cannot load.
        if (!cancelled) {
          setHighlightedHtml(null);
        }
      }
    }

    void highlight();

    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  const classNames = cn(
    "w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4",
    themeBgClass,
    className,
  );

  const codeContent = highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  ) : (
    <div className={classNames}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="relative group/codeblock" {...props}>
      {codeContent}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-2 right-2 h-8 w-8 rounded-md transition-opacity",
          "opacity-100 md:opacity-0 md:group-hover/codeblock:opacity-100",
          "bg-background/80 hover:bg-background border border-border",
        )}
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>;

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock };
