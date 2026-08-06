export const SERVICE_TYPES = [
  { id: 'house_cleaning',    name: 'House Cleaning',      desc: 'Standard, deep, or recurring home cleaning',     priced: true,  from: 120 },
  { id: 'move_clean',        name: 'Move In / Out',       desc: 'Landlord-ready move cleaning',                   priced: true,  from: 150 },
  { id: 'commercial',        name: 'Commercial Cleaning', desc: 'Offices, studios, and small businesses',         priced: false, from: 250 },
  { id: 'interior_painting', name: 'Interior Painting',   desc: 'Walls, trim, rooms, and touch-ups',              priced: false, from: 300 },
  { id: 'pressure_wash',     name: 'Pressure Washing',    desc: 'Driveways, siding, decks, and patios',           priced: false, from: 150 },
  { id: 'remodel',           name: 'Home Remodeling',     desc: 'Kitchens, baths, and general remodeling',        priced: false, from: 500 },
  { id: 'window_cleaning',   name: 'Window Cleaning',     desc: 'Interior and exterior windows',                  priced: false, from: 100 },
  { id: 'junk_removal',      name: 'Junk Removal',        desc: 'Haul-away, decluttering, and cleanouts',         priced: false, from: 150 },
  { id: 'organizing',        name: 'Home Organizing',     desc: 'Closets, pantries, and whole-home organizing', priced: false, from: 120 },
  { id: 'floor_cleaning',    name: 'Floor Cleaning',      desc: 'Tile, hardwood, and deep floor care',            priced: false, from: 100 },
];

export const CLEANING_LEVELS = [
  { id: 'standard', label: 'Standard', desc: 'Regular upkeep clean' },
  { id: 'deep',     label: 'Deep Clean', desc: 'Detailed, top-to-bottom' },
  { id: 'move',     label: 'Move In/Out', desc: 'Empty home, landlord-ready' },
];

export const PROJECT_SCOPES = [
  { id: 'small',  label: 'Small',  desc: 'One room or quick job' },
  { id: 'medium', label: 'Medium', desc: 'Several rooms or moderate area' },
  { id: 'large',  label: 'Large',  desc: 'Whole home or major project' },
];

export function isCleaningService(id) {
  return id === 'house_cleaning' || id === 'move_clean' || id === 'commercial';
}

export function getServiceById(id) {
  return SERVICE_TYPES.find((s) => s.id === id) || SERVICE_TYPES[0];
}
