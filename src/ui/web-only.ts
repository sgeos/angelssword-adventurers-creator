/**
 * The CSS the Tamagui components need and Tamagui cannot express.
 *
 * Three things. Grid layout and gradient-clipped text, which Tamagui renders
 * on the web but whose properties its style types do not admit, and the only
 * way past a type is an assertion, which the lint bans. And a `:last-child`
 * margin, for which Tamagui has no selector at all. None of the three exists
 * on a native target, so a class naming the web-only part is the honest shape.
 * The classes are set by `MainLayout`, `TwoCol`, `ConfigGrid` and `FormRow` in
 * `primitives.tsx`, and by the brand and about titles.
 *
 * Every selector starts with `:root`. Tamagui writes its atomic rules as
 * `:root ._marginBottom-16px` and its base rule for a view as `.is_View`, so a
 * plain class selector ties with the first and loses on order, which is what a
 * last form row's margin did when measured against the previous build. The
 * extra `:root` makes these more specific, and their position after Tamagui's
 * rules in the head is then not what decides it.
 */
export const WEB_ONLY_CSS = `
:root .main-layout { display: grid; grid-template-columns: 1fr 380px; align-items: start; }
:root .two-col { display: grid; grid-template-columns: 1fr 1fr; }
:root .config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
:root .form-row:last-child { margin-bottom: 0; }
:root .gradient-gold-text {
    background: linear-gradient(135deg, #dbb858, #f0d878);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
@media (max-width: 1100px) { :root .main-layout { grid-template-columns: 1fr; } }
@media (max-width: 768px) {
    :root .two-col { grid-template-columns: 1fr; }
    :root .config-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 640px) { :root .config-grid { grid-template-columns: 1fr; } }
`;
