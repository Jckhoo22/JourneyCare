import type { ReactNode } from "react";

/**
 * The single h1 primitive for signed-in pages. [UX pass R5]
 *
 * Wraps the existing `.app-h1` class so the display face, size and letter
 * spacing don't get restated per screen. One typographic level, everywhere.
 * The auth-shell forms have their own centered `.title` treatment — those
 * pages don't render inside `.app-main` so they keep their own h1 for now.
 */
interface PageTitleProps {
    children: ReactNode;
    /** For pages that need to tie a heading id (e.g. aria-labelledby). */
    id?: string;
}

const PageTitle = ({ children, id }: PageTitleProps) => (
    <h1 id={id} className="app-h1">
        {children}
    </h1>
);

export default PageTitle;
