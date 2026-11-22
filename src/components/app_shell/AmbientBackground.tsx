import "./AmbientBackground.css";

/**
 * A quietly-alive background. Home only.
 *
 * Three large low-alpha radial tints that drift on staggered slow loops, so
 * the page feels like weather rather than a still. Deliberately subtle: an
 * observer glancing at Home should not notice the motion; a second look after
 * five seconds should be the moment they realise it was moving all along.
 *
 * ── Why the tints are pre-blurred, NOT filter:blur ────────────────────────
 * A CSS `filter: blur(140px)` on a 45vw box is one of the most expensive
 * raster operations the browser does per frame, and any transform on that
 * layer re-rasterises the blur. The soft edges here come from the
 * radial-gradient's own alpha stops, so the blob's pixels are what the
 * gradient painted and moving the layer is a cheap compositor translate.
 *
 * ── Why only transform/opacity animate ────────────────────────────────────
 * Both properties are compositor-only on modern browsers, so the animation
 * runs off the main thread and cannot trigger layout or paint on any of the
 * cards above it. `top`/`left` or `background-position` would repaint.
 *
 * ── Why CSS keyframes, not JS ─────────────────────────────────────────────
 * The browser throttles CSS animations in hidden tabs automatically. A JS
 * loop (rAF, setInterval) would keep firing while the tab is backgrounded,
 * burn battery, and need its own visibilitychange plumbing.
 *
 * ── prefers-reduced-motion ────────────────────────────────────────────────
 * The animation is dropped in the media query below and each blob rests at
 * its keyframe midpoint (a translated/scaled position that's more visually
 * settled than the initial `translate(0)`). No JS branch needed.
 *
 * Rendered as `aria-hidden` with `pointer-events: none` — presentation only,
 * never in the tab order, never in the way of a tap.
 */
const AmbientBackground = () => (
    <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-blob ambient-blob-a" />
        <div className="ambient-blob ambient-blob-b" />
        <div className="ambient-blob ambient-blob-c" />
    </div>
);

export default AmbientBackground;
