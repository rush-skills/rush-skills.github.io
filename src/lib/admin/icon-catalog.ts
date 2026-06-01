// Curated gallery of free Lordicon icons for the admin icon picker, so editors
// can click an icon instead of hunting for a hash on lordicon.com. Every hash
// here was verified to load from the Lordicon CDN (and is already used somewhere
// on the site). Labels describe the glyph so the picker's filter is useful. Add
// more verified hashes as needed.
export interface CatalogIcon {
  hash: string;
  label: string;
}
export interface IconGroup {
  group: string;
  icons: CatalogIcon[];
}

export const ICON_CATALOG: IconGroup[] = [
  {
    group: 'Sections',
    icons: [
      { hash: 'kdduutaw', label: 'Person' },
      { hash: 'srupsmbe', label: 'Developer' },
      { hash: 'zhiiqoue', label: 'Briefcase' },
      { hash: 'tsrgicte', label: 'Folder' },
      { hash: 'fwkrbvja', label: 'Wrench' },
      { hash: 'vvyxyrur', label: 'School' },
      { hash: 'wxnxiano', label: 'Book' },
      { hash: 'msoeawqm', label: 'Search' },
      { hash: 'ozlkyfxg', label: 'Copyright' },
    ],
  },
  {
    group: 'Social & links',
    icons: [
      { hash: 'jjxzcivr', label: 'GitHub' },
      { hash: 'euybrknk', label: 'LinkedIn' },
      { hash: 'hmqxevgf', label: 'External link' },
      { hash: 'gsjfryhc', label: 'Link' },
    ],
  },
  {
    group: 'Tech',
    icons: [
      { hash: 'gvtjlyjf', label: 'Code' },
      { hash: 'ailnzwyn', label: 'Code window' },
      { hash: 'yvjimpju', label: 'Cloud code' },
      { hash: 'kikjlzqr', label: 'Cloud' },
      { hash: 'vbmtnozn', label: 'Server' },
      { hash: 'xqdfobxg', label: 'Storage' },
      { hash: 'qhgmphtg', label: 'Monitor' },
      { hash: 'oajcrtsi', label: '3D' },
      { hash: 'rpviwvwn', label: 'Globe' },
      { hash: 'gxexvjie', label: 'Blocks' },
    ],
  },
  {
    group: 'General',
    icons: [
      { hash: 'ebvizisb', label: 'Smile' },
      { hash: 'lewtedlh', label: 'Trophy' },
      { hash: 'wsaaegar', label: 'Camera' },
      { hash: 'ugllxeyl', label: 'Video' },
      { hash: 'exymduqj', label: 'Pencil' },
      { hash: 'rrbmabsx', label: 'Document' },
      { hash: 'zpxybbhl', label: 'Chat' },
      { hash: 'uisoczqi', label: 'Cart' },
      { hash: 'dkobpcrm', label: 'Discount' },
      { hash: 'qncyoyoi', label: 'Solar' },
      { hash: 'bsdkzyjd', label: 'Inspect' },
      { hash: 'vcdutftw', label: 'Tap' },
      { hash: 'wjyqkiew', label: 'Search (alt)' },
      { hash: 'kbtmbyzy', label: 'Chevron' },
      { hash: 'gupcdncx', label: 'Arrows' },
    ],
  },
];
