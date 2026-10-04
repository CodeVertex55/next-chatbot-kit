import type { Metadata } from "next";
import { business } from "@/content/business";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function Privacy() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="lead">
        A short, plain statement of what this demo does and does not do with the chat.
      </p>

      <section aria-labelledby="messages-heading">
        <h2 id="messages-heading">Chat messages</h2>
        <ul>
          <li>Your messages are sent to this site&apos;s server so that it can reply.</li>
          <li>
            When the site is connected to a language model, the recent messages of the conversation
            are passed to that model to write the reply. Until then the chat gives a fixed reply
            with our phone number and email.
          </li>
          <li>The server does not store or log what you type or what the assistant replies.</li>
          <li>
            The conversation is kept in your browser for the length of the tab, so that it survives
            moving between pages. It is gone when you close the tab.
          </li>
        </ul>
      </section>

      <section aria-labelledby="details-heading">
        <h2 id="details-heading">Callback details</h2>
        <ul>
          <li>
            If you enter a name, phone number and email in the form, they are checked and handed to
            whatever delivery is set up for the site. This demo has none, so they go nowhere and are
            not stored.
          </li>
          <li>
            Your browser remembers that you used the form, so that it is not shown again. It does
            not keep the details themselves.
          </li>
          <li>Please do not include medical or other sensitive details in the chat or the form.</li>
        </ul>
      </section>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading">Limits on use</h2>
        <p>
          To stop misuse, the server counts how many requests come from one address for a short
          time. The count is kept in memory only. Addresses are not logged or stored.
        </p>
      </section>

      <p>
        Questions about this page: <a href={`mailto:${business.email}`}>{business.email}</a>.
      </p>
    </>
  );
}
