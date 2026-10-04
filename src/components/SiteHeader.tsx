import Link from "next/link";
import { business } from "@/content/business";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-name" href="/">
          {business.name}
        </Link>
        <nav aria-label="Main">
          <ul className="site-nav">
            {business.pages.map((page) => (
              <li key={page.url}>
                <Link href={new URL(page.url).pathname}>{page.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
