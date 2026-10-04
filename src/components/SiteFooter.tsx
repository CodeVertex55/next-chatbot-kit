import { business } from "@/content/business";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>
          {business.name}, {business.address}
        </p>
        <p>
          <a href={business.phoneHref}>{business.phone}</a>
          {" | "}
          <a href={`mailto:${business.email}`}>{business.email}</a>
        </p>
        <p>
          {business.name} is a fictional business created for this demo. Any resemblance to a real
          practice is coincidental.
        </p>
      </div>
    </footer>
  );
}
