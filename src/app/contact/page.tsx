import type { Metadata } from "next";
import { business } from "@/content/business";

export const metadata: Metadata = {
  title: "Contact",
};

export default function Contact() {
  return (
    <>
      <h1>Contact</h1>
      <p className="lead">Call or email to book an appointment.</p>

      <section aria-labelledby="details-heading">
        <h2 id="details-heading">Get in touch</h2>
        <dl className="details">
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={business.phoneHref}>{business.phone}</a>
            </dd>
          </div>
          {business.emergencyPhone !== undefined && (
            <div>
              <dt>Emergency line</dt>
              <dd>{business.emergencyPhone}</dd>
            </div>
          )}
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${business.email}`}>{business.email}</a>
            </dd>
          </div>
          {business.address !== undefined && (
            <div>
              <dt>Address</dt>
              <dd>{business.address}</dd>
            </div>
          )}
        </dl>
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
        {business.hoursNote !== undefined && <p>{business.hoursNote}</p>}
      </section>
    </>
  );
}
