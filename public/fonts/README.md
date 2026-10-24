# Fonts

The four families the interface uses, hosted here so that loading the page
makes no request to another origin. Until 2026-10-24 they were fetched from
Google Fonts on every load, contradicting the README's statement that the later
stages work offline and telling a third party each time the tool was opened.

| Family | Files | Licence | Reserved Font Name |
|---|---|---|---|
| Cinzel | `cinzel/Cinzel[wght].ttf` | [OFL 1.1](./cinzel/OFL.txt) | None |
| Cinzel Decorative | `cinzel-decorative/CinzelDecorative-Regular.ttf`, `-Bold.ttf` | [OFL 1.1](./cinzel-decorative/OFL.txt) | Cinzel |
| Outfit | `outfit/Outfit[wght].ttf` | [OFL 1.1](./outfit/OFL.txt) | None |
| Share Tech Mono | `share-tech-mono/ShareTechMono-Regular.ttf` | [OFL 1.1](./share-tech-mono/OFL.txt) | Share |

Every file is the original from the `main` branch of
`github.com/google/fonts`, under `ofl/<family>/`, copied without modification,
and each licence is that repository's `OFL.txt` for the family. Fetched on
2026-10-24.

**Why the originals rather than the files Google serves.** Google serves subsets
by character range, in WOFF2, which totalled 138 kilobytes against about 401
here. Two of these licences reserve a font name, and the Open Font License lets
a modified version carry a reserved name only with permission. Whether a subset
counts as a modification was not settled before choosing, so the choice was the
one that does not depend on the answer. Converting these files to WOFF2 or
subsetting them would reopen that question.

Only the regular and bold weights of Cinzel Decorative are included, those
being the two the page asked Google for. Its black weight is not used.
