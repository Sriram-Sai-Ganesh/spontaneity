"use client";

import { cn } from "@/lib/utils";
import React from "react";
import { StickToBottom } from "use-stick-to-bottom";

export type ChatContainerProps = {
  children: React.ReactNode;
  className?: string;
} & React.ComponentProps<typeof StickToBottom>;

function ChatContainerRoot({
  className,
  children,
  ...props
}: ChatContainerProps) {
  return (
    <StickToBottom
      className={cn("relative flex flex-col overflow-hidden", className)}
      resize="smooth"
      initial="instant"
      role="log"
      {...props}
    >
      {children}
    </StickToBottom>
  );
}

export type ChatContainerContentProps = {
  children: React.ReactNode;
  className?: string;
};

function ChatContainerContent({
  className,
  children,
}: ChatContainerContentProps) {
  return (
    <StickToBottom.Content className={cn("flex w-full flex-col", className)}>
      {children}
    </StickToBottom.Content>
  );
}

export type ChatContainerScrollAnchorProps = {
  className?: string;
};

function ChatContainerScrollAnchor({
  className,
}: ChatContainerScrollAnchorProps) {
  return (
    <div
      className={cn("h-px w-full shrink-0 scroll-mt-4", className)}
      aria-hidden="true"
    />
  );
}

export { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor };
