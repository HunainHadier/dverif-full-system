/**
 * Client-side renderer for DOCX uploads.
 *
 * WHY THIS EXISTS
 * A browser cannot display a .docx natively: navigating to one downloads it.
 * PDF and image uploads therefore "just work" in a new tab, but a DOCX — which
 * the product accepts as both a request document and an employee reference —
 * silently turned every View click into a save. This module renders one in the
 * page instead.
 *
 * DESIGN CONSTRAINTS (deliberate, and worth keeping)
 *
 * 1. NO SERVER-SIDE CONVERSION. The file on disk stays a .docx. Nothing is
 *    rewritten to HTML, no .html is written, and no new route is added. The
 *    only network traffic is the same authenticated blob fetch every other
 *    document already makes, so the server's ownership rules for who may read
 *    which document are unchanged — a viewer that bypassed them would hand one
 *    organization's documents to another.
 *
 * 2. NO dangerouslySetInnerHTML, ANYWHERE. docx-preview is used for exactly the
 *    reason the task specifies: it is a layout engine that builds real DOM.
 *    Verified against the installed 0.4.1 dist bundle:
 *      - its `h()` builder creates elements with document.createElement /
 *        createElementNS and text with document.createTextNode;
 *      - the only `innerHTML` writes in the whole bundle are the literal
 *        `elem.innerHTML = "&nbsp;"` and the two container-clearing lines at
 *        the start of a render — none of which carry document content;
 *      - it never emits <script>/<iframe>/<object>/<embed> and never sets an
 *        `href`, so there is no javascript: URL surface;
 *      - non-standard attributes are applied as DOM property assignments
 *        (`result[key] = value`), never via setAttribute on an HTML string.
 *    So text from the document can only ever become a text node. This module
 *    never touches innerHTML either, and says so where a future edit would
 *    otherwise be tempted to.
 *
 * 3. LAZY LOAD. The library is ~75 kB minified and is only useful for DOCX, so
 *    it is pulled in with a dynamic import the first time one is opened. Users
 *    who never view a DOCX — i.e. nearly everyone — never download it and the
 *    initial bundle is unchanged.
 */

/**
 * Render a DOCX into `container`.
 *
 * `container` is emptied by the library before it renders, so the caller does
 * not have to. Rejects on a corrupt/unparseable package so the caller can show
 * a real error instead of an empty panel — a DOCX that is not a valid ZIP with
 * a word/document.xml part throws out of the parser.
 */
export async function renderDocx(blob: Blob, container: HTMLElement): Promise<void> {
  const { renderAsync } = await import("docx-preview");

  // Options are the library's own defaults, spelled out so a future change to
  // them is a deliberate diff rather than an invisible behaviour change.
  await renderAsync(blob, container, undefined, {
    className: "docx",
    inWrapper: true,
    breakPages: true,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    experimental: true,
    useBase64URL: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderChanges: true,
    renderComments: true,
    renderAltChunks: true,
    ignoreLastRenderedPageBreak: true,
    trimXmlDeclaration: true,
    hideWrapperOnPrint: false,
    debug: false,
  });
}
