import { AVAILABLE_MODELS, DEFAULT_MODEL } from "../models";

describe("models config", () => {
  it("exports a non-empty list of models", () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
  });

  it("each model has an id and label", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
    }
  });

  it("model ids are unique", () => {
    const ids = AVAILABLE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("DEFAULT_MODEL matches one of the available model ids", () => {
    const ids = AVAILABLE_MODELS.map((m) => m.id);
    expect(ids).toContain(DEFAULT_MODEL);
  });
});
