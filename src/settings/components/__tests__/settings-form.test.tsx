import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import SettingsForm from "../settings-form";

describe("SettingsForm", () => {
  const defaultValues = {
    displayName: "Alice",
    openRouterApiKey: "",
  };

  it("renders initial values", () => {
    render(<SettingsForm initialValues={defaultValues} onSubmit={vi.fn()} emailNotificationsEnabled={true} onEmailNotificationsChange={vi.fn()} />);

    expect(screen.getByLabelText("Nickname")).toHaveValue("Alice");
  });

  it("save button is disabled when unchanged", () => {
    render(<SettingsForm initialValues={defaultValues} onSubmit={vi.fn()} emailNotificationsEnabled={true} onEmailNotificationsChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls onSubmit with trimmed values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<SettingsForm initialValues={defaultValues} onSubmit={onSubmit} emailNotificationsEnabled={true} onEmailNotificationsChange={vi.fn()} />);

    const nameInput = screen.getByLabelText("Nickname");
    await user.clear(nameInput);
    await user.type(nameInput, "  Bob  ");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    expect(onSubmit).toHaveBeenCalledWith({
      displayName: "Bob",
      openRouterApiKey: "",
    });
  });

  it("renders email notifications checkbox with correct initial state", () => {
    render(<SettingsForm initialValues={defaultValues} onSubmit={vi.fn()} emailNotificationsEnabled={false} onEmailNotificationsChange={vi.fn()} />);

    const checkbox = screen.getByLabelText("Email notifications");
    expect(checkbox).not.toBeChecked();
  });

  it("calls onEmailNotificationsChange when checkbox is toggled", async () => {
    const user = userEvent.setup();
    const onEmailNotificationsChange = vi.fn();

    render(<SettingsForm initialValues={defaultValues} onSubmit={vi.fn()} emailNotificationsEnabled={true} onEmailNotificationsChange={onEmailNotificationsChange} />);

    await user.click(screen.getByLabelText("Email notifications"));

    expect(onEmailNotificationsChange).toHaveBeenCalledWith(false);
  });
});
