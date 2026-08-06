export const SERVICE_TYPES = [
  { id: 'house_cleaning',    name: 'House Cleaning',      desc: 'Standard, deep, or recurring home cleaning',     priced: true,  from: 150 },
  { id: 'move_clean',        name: 'Move In / Out',       desc: 'Landlord-ready move cleaning',                   priced: true,  from: 185 },
  { id: 'commercial',        name: 'Commercial Cleaning', desc: 'Offices, studios, and small businesses',         priced: false, from: 300 },
  { id: 'landscaping',       name: 'Landscaping',         desc: 'Lawn mowing, trimming, mulch, and yard care',    priced: false, from: 100 },
  { id: 'interior_painting', name: 'Interior Painting',   desc: 'Walls, trim, rooms, and touch-ups',              priced: false, from: 375 },
  { id: 'pressure_wash',     name: 'Pressure Washing',    desc: 'Driveways, siding, decks, and patios',           priced: false, from: 185 },
  { id: 'remodel',           name: 'Home Remodeling',     desc: 'Kitchens, baths, and general remodeling',        priced: false, from: 650 },
  { id: 'junk_removal',      name: 'Junk Removal',        desc: 'Haul-away, decluttering, and cleanouts',         priced: false, from: 185 },
];

export const LANDSCAPE_OPTIONS = [
  { id: 'mow',     name: 'Lawn mowing / cut grass' },
  { id: 'edge',    name: 'Edging & weed trimming' },
  { id: 'leaf',    name: 'Leaf cleanup' },
  { id: 'hedge',   name: 'Hedge / bush trimming' },
  { id: 'mulch',   name: 'Mulching beds' },
  { id: 'cleanup', name: 'Yard cleanup / debris removal' },
];

export const CLEANING_LEVELS = [
  { id: 'standard', label: 'Standard', desc: 'Regular upkeep clean' },
  { id: 'deep',     label: 'Deep Clean', desc: 'Detailed, top-to-bottom' },
  { id: 'move',     label: 'Move In/Out', desc: 'Empty home, landlord-ready' },
];

export const PROJECT_SCOPES = [
  { id: 'small',  label: 'Small',  desc: 'Quick, limited job' },
  { id: 'medium', label: 'Medium', desc: 'Typical home or property' },
  { id: 'large',  label: 'Large',  desc: 'Major or full-property job' },
];

/** Service-specific Small / Medium / Large descriptions for the quote wizard. */
const PROJECT_SCOPES_BY_SERVICE = {
  landscaping: [
    { id: 'small',  label: 'Small',  desc: 'Front lawn or compact yard' },
    { id: 'medium', label: 'Medium', desc: 'Typical front and back yard' },
    { id: 'large',  label: 'Large',  desc: 'Large property or heavy overgrowth' },
  ],
  interior_painting: [
    { id: 'small',  label: 'Small',  desc: 'One room or touch-ups' },
    { id: 'medium', label: 'Medium', desc: 'Several rooms or hallways' },
    { id: 'large',  label: 'Large',  desc: 'Whole home or major repaint' },
  ],
  pressure_wash: [
    { id: 'small',  label: 'Small',  desc: 'One surface (driveway or patio)' },
    { id: 'medium', label: 'Medium', desc: 'Driveway plus patio or walkways' },
    { id: 'large',  label: 'Large',  desc: 'Whole exterior or large property' },
  ],
  remodel: [
    { id: 'small',  label: 'Small',  desc: 'Single-room refresh' },
    { id: 'medium', label: 'Medium', desc: 'Kitchen or bathroom remodel' },
    { id: 'large',  label: 'Large',  desc: 'Multi-room or major remodel' },
  ],
  junk_removal: [
    { id: 'small',  label: 'Small',  desc: 'A few items or one room' },
    { id: 'medium', label: 'Medium', desc: 'Garage, basement, or several rooms' },
    { id: 'large',  label: 'Large',  desc: 'Full cleanout or estate haul' },
  ],
};

/**
 * Project size options for the selected non-cleaning service(s).
 * Uses the first matching service's copy when multiple are selected.
 */
export function getProjectScopes(serviceIds = []) {
  const otherId = serviceIds.find((id) => !isCleaningService(id));
  if (otherId && PROJECT_SCOPES_BY_SERVICE[otherId]) {
    return PROJECT_SCOPES_BY_SERVICE[otherId];
  }
  return PROJECT_SCOPES;
}

export function isCleaningService(id) {
  return id === 'house_cleaning' || id === 'move_clean' || id === 'commercial';
}

export function hasCleaningService(ids = []) {
  return ids.some(isCleaningService);
}

export function hasNonCleaningService(ids = []) {
  return ids.some((id) => !isCleaningService(id));
}

export function getServiceById(id) {
  return SERVICE_TYPES.find((s) => s.id === id) || SERVICE_TYPES[0];
}

export function getServiceNames(ids = []) {
  return ids.map((id) => getServiceById(id).name).join(', ');
}
