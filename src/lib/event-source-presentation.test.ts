import { describe, expect, it } from "vitest";
import {
  formatEventSourceLabel,
  formatEventSourceLinkLabel,
} from "./event-source-presentation";

describe("event source presentation", () => {
  it("formats known provider labels", () => {
    expect(formatEventSourceLabel("ticketmaster")).toBe("Ticketmaster");
    expect(formatEventSourceLabel("yelp")).toBe("Yelp");
  });

  it("formats unknown provider labels into title case", () => {
    expect(formatEventSourceLabel("custom_source-name")).toBe("Custom Source Name");
  });

  it("creates provider-aware link labels", () => {
    expect(formatEventSourceLinkLabel("ticketmaster")).toBe("View on Ticketmaster");
    expect(formatEventSourceLinkLabel("yelp")).toBe("View on Yelp");
  });
});
