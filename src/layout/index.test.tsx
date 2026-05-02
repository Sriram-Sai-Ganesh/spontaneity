import type { ReactNode } from "react";
import { fireEvent, render } from "@testing-library/react";
import Layout from "./index";

vi.mock("./header", () => ({
  default: () => <div data-testid="layout-header" />,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("radix-ui", () => ({
  VisuallyHidden: {
    Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
}));

function stubRect(width: number, height: number): DOMRect {
  return {
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("Layout", () => {
  it("keeps desktop tracks shrinkable when the right pane is expanded", () => {
    const { container } = render(
      <Layout
        sidebar={<div>Sidebar</div>}
        content={<div>Content</div>}
        rightPanel={<div>Right panel</div>}
      />,
    );

    const grid = container.querySelector(
      '[style*="grid-template-columns"]',
    ) as HTMLDivElement | null;

    expect(grid).not.toBeNull();
    if (!grid) {
      throw new Error("Expected desktop layout grid");
    }

    expect(grid.style.gridTemplateColumns).toBe(
      "minmax(0, 0.24fr) 8px minmax(0, 0.46fr) 8px minmax(0, 0.3fr)",
    );

    Object.defineProperty(grid, "getBoundingClientRect", {
      configurable: true,
      value: () => stubRect(1200, 900),
    });

    const separators = container.querySelectorAll(
      '[role="separator"][aria-orientation="vertical"]',
    );
    expect(separators).toHaveLength(2);

    fireEvent.mouseDown(separators[1], { clientX: 800 });
    fireEvent.mouseMove(window, { clientX: 500 });
    fireEvent.mouseUp(window);

    expect(grid.style.gridTemplateColumns).toBe(
      "minmax(0, 0.24fr) 8px minmax(0, 0.34fr) 8px minmax(0, 0.42fr)",
    );

    expect(grid.children[0]).toHaveClass("min-w-0");
    expect(grid.children[2]).toHaveClass("min-w-0");
    expect(grid.children[4]).toHaveClass("min-w-0");
  });
});
