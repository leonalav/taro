# ADI source policy

Each bundled pack declares its publisher, edition, source locators, retrieval date, content-use rights and a checksum for every imported section. Original source prose and Taro interpretation occupy separate fields. Coverage counts unavailable sections explicitly. Local import checks edition, redirects and inventory changes without rewriting the pinned bundle during a run.

WCAG 2.2 is pinned to the 12 December 2024 W3C Recommendation. The APG pack uses the W3C repository commit identified in `data/sources.json`. APG guidance is informative. Nielsen and Shneiderman packs contain derived operational guidance. Publisher platform guides, restricted ISO clauses and design-school references still require section-level intake. Access to a title or abstract does not provide reproduction rights for the full content.

Run `pnpm adi:verify` for the partial-release inventory. A complete-corpus check exits unsuccessfully while unavailable entries remain. See [third-party notices](../../THIRD_PARTY_NOTICES.md) for W3C attribution.
