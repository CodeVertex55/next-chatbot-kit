import Link from "next/link";
import { business, highlights } from "@/content/business";

export default function Home() {
  const description = business.description.charAt(0).toUpperCase() + business.description.slice(1);

  return (
    <>
      <h1>{business.name}</h1>
      <p className="lead">{description}.</p>

      <section aria-labelledby="highlights-heading">
        <h2 id="highlights-heading">Why patients choose us</h2>
        <ul className="highlights">
          {highlights.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hours-heading">
        <h2 id="hours-heading">Opening hours</h2>
        <dl className="hours">
          {business.hours.map((entry) => (
            <div key={entry.days}>
              <dt>{entry.days}</dt>
              <dd>{entry.hours}</dd>
            </div>
          ))}
        </dl>
        <p>
          See the <Link href="/treatments">treatments and fees</Link> or{" "}
          <Link href="/contact">get in touch</Link> to book.
        </p>
      </section>

      <aside className="demo-note" aria-labelledby="demo-heading">
        <h2 id="demo-heading">About this demo</h2>
        <p>
          This site demonstrates next-chatbot-kit, a chat assistant for small business websites.
          Open the chat in the corner of the page and ask a question. The assistant is set up to
          answer from the content on this site.
        </p>
      </aside>
    </>
  );
}
