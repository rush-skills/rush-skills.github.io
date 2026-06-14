// Shared link "kind" options — used by the admin Links form, the bookmarklet
// quick-add page, and the /links display labels, so they never drift apart.
export const LINK_KINDS = [
  { value: 'article', label: 'Article' },
  { value: 'video', label: 'Video' },
  { value: 'repo', label: 'Repo' },
  { value: 'tool', label: 'Tool / Service' },
  { value: 'paper', label: 'Paper' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'book', label: 'Book' },
  { value: 'resource', label: 'Resource' },
  { value: 'bookmark', label: 'Bookmark' },
] as const;

export const LINK_KIND_VALUES: string[] = LINK_KINDS.map((k) => k.value);
export const KIND_LABELS: Record<string, string> = Object.fromEntries(LINK_KINDS.map((k) => [k.value, k.label]));
