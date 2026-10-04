import { expect, test } from "@playwright/test";

test("skips the form, gets the holding reply and returns focus on Escape", async ({ page }) => {
  await page.goto("/");

  const launcher = page.getByRole("button", { name: "Open chat" });
  await launcher.click();

  const dialog = page.getByRole("dialog", { name: "Chat" });
  await expect(dialog.getByLabel("Name")).toBeVisible();
  await expect(dialog.getByText("This is a demo.")).toBeVisible();

  await dialog.getByRole("button", { name: "Skip for now" }).click();

  const composer = dialog.getByLabel("Your message");
  await expect(composer).toBeFocused();
  await composer.fill("What are your opening hours?");
  await composer.press("Enter");

  // The widget styles come from a CSS module, so the assistant bubble is found by class fragment.
  const reply = dialog.locator('[class*="assistant"]').filter({ hasText: "555-0142" });
  await expect(reply).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Open chat" })).toBeFocused();
});

test("submits the lead form and opens the chat", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open chat" }).click();

  const dialog = page.getByRole("dialog", { name: "Chat" });
  await dialog.getByLabel("Name").fill("Test Visitor");
  await dialog.getByLabel("Phone").fill("555-0199");
  await dialog.getByLabel("Email").fill("visitor@example.com");
  await dialog.getByRole("button", { name: "Start chat" }).click();

  await expect(dialog.getByLabel("Your message")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveCount(0);
});

test("refuses a chat request from a foreign origin", async ({ request }) => {
  const response = await request.post("/api/chat", {
    headers: { Origin: "https://elsewhere.example" },
    data: { messages: [{ role: "user", content: "Hello" }] },
  });
  expect(response.status()).toBe(403);
});
