import Link from "next/link";
import { business, navPages } from "@/content/business";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-name" href="/">
          {business.name}
        </Link>
        <nav aria-label="Main">
          <ul className="site-nav">
            {navPages.map((page) => (
              <li key={page.path}>
                <Link href={page.path}>{page.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
