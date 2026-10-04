// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWidget } from "@/chat/widget";
import { KEYS } from "@/chat/widget/storage";
import type { PublicChatConfig } from "@/chat/config";
import { controlledResponse, jsonResponse, publicConfig, textResponse } from "./helpers";

const fetchMock = vi.fn();
let leadResponse: () => Promise<Response>;
let chatResponse: () => Promise<Response>;

beforeEach(() => {
  leadResponse = async () => jsonResponse(200, { ok: true });
  chatResponse = async () => textResponse(["Hello back"]);
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) =>
    url === "/api/chat/lead" ? leadResponse() : chatResponse(),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function renderWidget(overrides: Partial<PublicChatConfig> = {}) {
  const config = publicConfig({ greetingDelayMs: 0, ...overrides });
  const user = userEvent.setup();
  const view = render(<ChatWidget config={config} />);
  return { config, user, ...view };
}

function launcher() {
  return document.querySelector<HTMLButtonElement>("button[aria-controls]")!;
}

function leadCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/chat/lead");
}

function chatCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/chat");
}

/** The visible message bubbles with this text, leaving out the live region copy. */
async function findBubble(text: string | RegExp): Promise<HTMLElement> {
  const matches = await screen.findAllByText(text);
  const bubble = matches.find((element) => !element.closest("[aria-live]"));
  if (bubble === undefined) throw new Error("No visible message matched");
  return bubble;
}

async function fillLead(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Jo Smith");
  await user.type(screen.getByLabelText("Phone"), "0412 345 678");
  await user.type(screen.getByLabelText("Email"), "jo@example.test");
  await user.click(screen.getByRole("button", { name: "Start chat" }));
}

describe("launcher and panel", () => {
  it("is closed at first and toggles with a labelled button", async () => {
    const { user } = renderWidget({ leadMode: "off" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(launcher()).toHaveAccessibleName("Open chat");
    expect(launcher()).toHaveAttribute("aria-expanded", "false");

    await user.click(launcher());
    const dialog = screen.getByRole("dialog", { name: "Chat" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(launcher()).toHaveAccessibleName("Close chat");
    expect(launcher()).toHaveAttribute("aria-expanded", "true");
    expect(launcher()).toHaveAttribute("aria-controls", dialog.id);

    await user.click(launcher());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the persona name and label in the header", async () => {
    const { user, config } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(config.persona.name)).toBeInTheDocument();
    expect(within(dialog).getByText(config.persona.label)).toBeInTheDocument();
  });

  it("closes with the header button and returns focus to the launcher", async () => {
    const { user } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Close chat" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(launcher()).toHaveFocus();
  });

  it("closes on Escape from inside the panel and returns focus to the launcher", async () => {
    const { user } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(launcher()).toHaveFocus();
    expect(launcher()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape from the lead form", async () => {
    const { user } = renderWidget();
    await user.click(launcher());
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(launcher()).toHaveFocus();
  });
});

describe("lead modes", () => {
  it("required: shows the form first and the chat after a successful submit", async () => {
    const { user } = renderWidget({ leadMode: "required" });
    await user.click(launcher());

    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByLabelText("Phone")).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText("Phone")).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(
      screen.getByText("Please do not include medical or other sensitive details."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Your message" })).toBeNull();
    expect(screen.getByRole("dialog").querySelector("form")).toHaveAttribute("novalidate");

    await fillLead(user);

    expect(await screen.findByRole("textbox", { name: "Your message" })).toHaveFocus();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(leadCalls()).toHaveLength(1);
    const init = leadCalls()[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Jo Smith",
      phone: "0412 345 678",
      email: "jo@example.test",
      page: "/",
      company: "",
    });
    expect(localStorage.getItem(KEYS.leadDone)).not.toBeNull();
  });

  it("optional: offers a skip control that goes to the chat", async () => {
    const { user } = renderWidget({ leadMode: "optional" });
    await user.click(launcher());
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveFocus();
    expect(leadCalls()).toHaveLength(0);

    await user.click(launcher());
    await user.click(launcher());
    expect(screen.getByRole("textbox", { name: "Your message" })).toBeInTheDocument();
  });

  it("off: opens the chat directly and offers a callback button", async () => {
    const { user } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    expect(screen.getByRole("textbox", { name: "Your message" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Request a callback" }));
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();

    await fillLead(user);
    expect(await screen.findByRole("textbox", { name: "Your message" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Thanks. We will call you back.");
    expect(screen.queryByRole("button", { name: "Request a callback" })).toBeNull();
  });

  it("does not show the form again after a successful submit", async () => {
    const { user } = renderWidget({ leadMode: "required" });
    await user.click(launcher());
    await fillLead(user);
    await screen.findByRole("textbox", { name: "Your message" });

    await user.keyboard("{Escape}");
    await user.click(launcher());
    expect(screen.getByRole("textbox", { name: "Your message" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByText("Thanks. We will call you back.")).toBeNull();
  });

  it("skips the form when a lead was stored by an earlier visit", async () => {
    localStorage.setItem(KEYS.leadDone, "1");
    const { user } = renderWidget({ leadMode: "required" });
    await user.click(launcher());
    expect(screen.getByRole("textbox", { name: "Your message" })).toBeInTheDocument();
  });

  it("shows the privacy link and demo notice when configured", async () => {
    const { user } = renderWidget({
      privacyUrl: "/privacy",
      demoNotice: "This is a demo business.",
    });
    await user.click(launcher());
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByText("This is a demo business.")).toBeInTheDocument();
  });

  it("omits the privacy link and demo notice when not configured", async () => {
    const { user } = renderWidget();
    await user.click(launcher());
    expect(screen.queryByRole("link", { name: "Privacy policy" })).toBeNull();
    expect(screen.queryByText("This is a demo business.")).toBeNull();
  });
});

describe("lead form errors", () => {
  it("renders field errors from a 400 and links them to the inputs", async () => {
    leadResponse = async () =>
      jsonResponse(400, {
        ok: false,
        errors: { name: "Enter your name.", phone: "Enter a valid phone number." },
      });
    const { user } = renderWidget();
    await user.click(launcher());
    await fillLead(user);

    const name = screen.getByLabelText("Name");
    const phone = screen.getByLabelText("Phone");
    const email = screen.getByLabelText("Email");
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter your name.");
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription("Enter a valid phone number.");
    expect(email).not.toHaveAttribute("aria-invalid", "true");
    expect(email).not.toHaveAttribute("aria-describedby");
    expect(name).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "Your message" })).toBeNull();
    expect(localStorage.getItem(KEYS.leadDone)).toBeNull();
  });

  it("clears the field errors on a new attempt", async () => {
    leadResponse = async () =>
      jsonResponse(400, { ok: false, errors: { email: "Enter a valid email address." } });
    const { user } = renderWidget();
    await user.click(launcher());
    await fillLead(user);
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();

    leadResponse = async () => jsonResponse(200, { ok: true });
    await user.click(screen.getByRole("button", { name: "Start chat" }));
    expect(await screen.findByRole("textbox", { name: "Your message" })).toBeInTheDocument();
  });

  it("shows the rate limit text on a 429", async () => {
    leadResponse = async () => jsonResponse(429, { error: "Too many requests." });
    const { user, config } = renderWidget();
    await user.click(launcher());
    await fillLead(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(config.strings.errorRateLimited);
  });

  it("shows the network text when the request fails", async () => {
    leadResponse = async () => {
      throw new TypeError("offline");
    };
    const { user, config } = renderWidget();
    await user.click(launcher());
    await fillLead(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(config.strings.errorNetwork);
    expect(screen.getByLabelText("Name")).toHaveValue("Jo Smith");
  });

  it("has a honeypot field that is hidden from the accessibility tree", async () => {
    const { user } = renderWidget();
    await user.click(launcher());
    const honeypot = screen
      .getByRole("dialog")
      .querySelector<HTMLInputElement>('input[name="company"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("aria-hidden", "true");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot).toHaveAttribute("autocomplete", "off");
    expect(screen.getAllByRole("textbox")).not.toContain(honeypot);
  });

  it("sends the honeypot value so the server can discard bots", async () => {
    const { user } = renderWidget();
    await user.click(launcher());
    const honeypot = screen
      .getByRole("dialog")
      .querySelector<HTMLInputElement>('input[name="company"]')!;
    await user.type(honeypot, "Acme");
    await fillLead(user);
    await screen.findByRole("textbox", { name: "Your message" });
    const body = JSON.parse((leadCalls()[0]![1] as RequestInit).body as string);
    expect(body.company).toBe("Acme");
  });
});

describe("chat", () => {
  it("sends a suggestion chip, shows the reply and hides the chips", async () => {
    const { user } = renderWidget({
      leadMode: "off",
      suggestions: ["What are your hours?", "Where are you?"],
    });
    await user.click(launcher());
    await user.click(screen.getByRole("button", { name: "What are your hours?" }));

    await findBubble("Hello back");
    expect(screen.getByText("What are your hours?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Where are you?" })).toBeNull();
    expect(chatCalls()).toHaveLength(1);
    const body = JSON.parse((chatCalls()[0]![1] as RequestInit).body as string);
    expect(body.messages).toEqual([{ role: "user", content: "What are your hours?" }]);
    expect(screen.getByRole("textbox", { name: "Your message" })).toHaveFocus();
  });

  it("sends on Enter and adds a new line on Shift+Enter", async () => {
    const { user } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    const box = screen.getByRole("textbox", { name: "Your message" });

    await user.type(box, "one{Shift>}{Enter}{/Shift}two");
    expect(box).toHaveValue("one\ntwo");
    expect(chatCalls()).toHaveLength(0);

    await user.keyboard("{Enter}");
    await findBubble("Hello back");
    expect(box).toHaveValue("");
    const body = JSON.parse((chatCalls()[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).toBe("one\ntwo");
  });

  it("disables send when empty and sets maxLength from the config", async () => {
    const { user } = renderWidget({ leadMode: "off", maxMessageChars: 150 });
    await user.click(launcher());
    const box = screen.getByRole("textbox", { name: "Your message" });
    expect(box).toHaveAttribute("maxlength", "150");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(box, "Hi");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("shows a character counter within 100 characters of the limit", async () => {
    const { user } = renderWidget({ leadMode: "off", maxMessageChars: 150 });
    await user.click(launcher());
    const box = screen.getByRole("textbox", { name: "Your message" });
    await user.type(box, "a".repeat(49));
    expect(screen.queryByText("49/150")).toBeNull();
    await user.type(box, "a");
    expect(screen.getByText("50/150")).toBeInTheDocument();
  });

  it("shows a typing indicator and announces the reply only when it completes", async () => {
    const feed = controlledResponse();
    chatResponse = async () => feed.response;
    const { user } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Hi{Enter}");

    expect(await screen.findByText("Typing")).toBeInTheDocument();
    const live = screen.getByRole("dialog").querySelector('[aria-live="polite"]')!;
    expect(live).toHaveTextContent("");

    await act(async () => {
      feed.push("Partial ");
    });
    expect(await screen.findByText("Partial")).toBeInTheDocument();
    expect(screen.queryByText("Typing")).toBeNull();
    expect(live).toHaveTextContent("");

    await act(async () => {
      feed.push("reply");
      feed.close();
    });
    await waitFor(() => expect(live).toHaveTextContent("Partial reply"));
  });

  it("swaps send for stop while streaming and stop keeps the partial reply", async () => {
    const feed = controlledResponse();
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url !== "/api/chat") return leadResponse();
      init.signal?.addEventListener("abort", () => feed.close());
      return Promise.resolve(feed.response);
    });
    const { user } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Hi{Enter}");

    const stop = await screen.findByRole("button", { name: "Stop" });
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    await act(async () => {
      feed.push("Half an answ");
    });
    await findBubble("Half an answ");

    await user.click(stop);
    expect(await screen.findByRole("button", { name: "Send" })).toBeInTheDocument();
    await findBubble("Half an answ");
  });

  it("shows a rate limit message with the phone number linked", async () => {
    chatResponse = async () => jsonResponse(429, { error: "Too many requests." });
    const { user, config } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Hi{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(config.strings.errorRateLimited);
    expect(within(alert).getByRole("link", { name: config.phone })).toHaveAttribute(
      "href",
      config.phoneHref,
    );
  });

  it("shows a network message with the phone number linked", async () => {
    chatResponse = async () => {
      throw new TypeError("offline");
    };
    const { user, config } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Hi{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(config.strings.errorNetwork);
    expect(within(alert).getByRole("link", { name: config.phone })).toBeInTheDocument();
  });

  it("renders markup in a reply as text and links only the phone and own host", async () => {
    chatResponse = async () =>
      textResponse([
        'Call 555-0100 or see https://testloaf.example/menu and https://evil.test/x <img src=x onerror="alert(1)">',
      ]);
    const { user } = renderWidget({ leadMode: "off" });
    await user.click(launcher());
    await user.type(screen.getByRole("textbox", { name: "Your message" }), "Hi{Enter}");

    await findBubble(/Call/);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("img")).toBeNull();
    const hrefs = [...dialog.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["tel:+15550100", "https://testloaf.example/menu"]);
    expect(dialog).toHaveTextContent('<img src=x onerror="alert(1)">');
  });

  it("restores the conversation after a remount", async () => {
    const first = renderWidget({ leadMode: "off" });
    await first.user.click(launcher());
    await first.user.type(screen.getByRole("textbox", { name: "Your message" }), "Hi{Enter}");
    await findBubble("Hello back");
    first.unmount();

    const second = renderWidget({ leadMode: "off" });
    await second.user.click(launcher());
    await findBubble("Hi");
    await findBubble("Hello back");
  });
});

describe("greeting bubble", () => {
  async function advance(ms: number) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("appears after the delay and stays dismissed", async () => {
    vi.useFakeTimers();
    const config = publicConfig({
      greetingDelayMs: 3000,
      leadMode: "off",
      greeting: "Hello friend",
    });
    const { unmount } = render(<ChatWidget config={config} />);
    expect(screen.queryByText("Hello friend")).toBeNull();
    await advance(2999);
    expect(screen.queryByText("Hello friend")).toBeNull();
    await advance(1);
    expect(screen.getByText("Hello friend")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Hello friend")).toBeNull();
    expect(localStorage.getItem(KEYS.greetingDismissed)).not.toBeNull();

    unmount();
    render(<ChatWidget config={config} />);
    await advance(10000);
    expect(screen.queryByText("Hello friend")).toBeNull();
  });

  it("opens the panel when the bubble is clicked", async () => {
    vi.useFakeTimers();
    const config = publicConfig({
      greetingDelayMs: 1000,
      leadMode: "off",
      greeting: "Hello friend",
    });
    render(<ChatWidget config={config} />);
    await advance(1000);
    fireEvent.click(screen.getByRole("button", { name: "Hello friend" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hello friend" })).toBeNull();
    expect(localStorage.getItem(KEYS.greetingDismissed)).toBeNull();
  });

  it("does not appear when the delay is zero", async () => {
    vi.useFakeTimers();
    const config = publicConfig({ greetingDelayMs: 0, greeting: "Hello friend" });
    render(<ChatWidget config={config} />);
    await advance(60000);
    expect(screen.queryByText("Hello friend")).toBeNull();
  });
});

describe("blocked storage", () => {
  it("still opens, takes a lead and chats when storage throws", async () => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      });
    }
    const { user } = renderWidget({ leadMode: "required" });
    await user.click(launcher());
    await fillLead(user);
    const box = await screen.findByRole("textbox", { name: "Your message" });
    await user.type(box, "Hi{Enter}");
    await findBubble("Hello back");

    await user.keyboard("{Escape}");
    await user.click(launcher());
    expect(screen.getByRole("textbox", { name: "Your message" })).toBeInTheDocument();
  });

  it("still shows the greeting when storage throws", async () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <ChatWidget config={publicConfig({ greetingDelayMs: 500, greeting: "Hello friend" })} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Hello friend")).toBeInTheDocument();
  });
});
