'use client';

const ICONS = {
  house_cleaning: (
    <g>
      <path d="M4 14 L12 6 L20 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 13 V20 H18 V13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="10.2" y="15.5" width="3.6" height="4.5" rx="0.6" fill="currentColor" />
      <path d="M19 18.5 L16.5 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M15.2 11.2 Q16.8 9.6 18.4 11.2 Q17.6 12.8 16 12.8 Q14.4 12 15.2 11.2Z" fill="currentColor" />
    </g>
  ),
  move_clean: (
    <g>
      <rect x="4" y="8" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 11 H16" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 8 V6.5 A2 2 0 0 1 12 6.5 V8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M17 14 H20 V18 H17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="7" cy="19.5" r="1.2" fill="currentColor" />
      <circle cx="13" cy="19.5" r="1.2" fill="currentColor" />
    </g>
  ),
  commercial: (
    <g>
      <path d="M5 20 V7 H11 V20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11 20 V10 H19 V20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 10 H9 M7 13 H9 M7 16 H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M13.5 13 H16.5 M13.5 16 H16.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M13.5 20 V17.5 H16.5 V20" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </g>
  ),
  interior_painting: (
    <g>
      <path d="M6 5 H14 L15.5 8 H6.5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 8 V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 14.5 Q10 12.5 13 14.5 Q10 19 7 14.5Z" fill="currentColor" />
      <path d="M16 11 L19 14 L12 21 L9 18 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </g>
  ),
  pressure_wash: (
    <g>
      <path d="M4 16 H10 L12 8 H6 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 10 H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 8.5 L20 7 M16 10.5 L20 10.5 M16 12.5 L20 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="18.5" r="1.3" fill="currentColor" />
      <circle cx="12.5" cy="18.5" r="1.3" fill="currentColor" />
    </g>
  ),
  remodel: (
    <g>
      <path d="M7 20 L10 8 L13 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.2 16 H11.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M15 7 L19 11 L12 18 L8 14 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14.2 16.2 L17.5 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
  window_cleaning: (
    <g>
      <rect x="5" y="5" width="14" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 5 V19 M5 12 H19" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7 L9.5 9.5 M8 7 H7 V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M16 16 L19.5 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </g>
  ),
  junk_removal: (
    <g>
      <path d="M4 12 H14 L16 16 H4 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 12 L18 12 L20 16 H16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="7.5" cy="18.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16.5" cy="18.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 9 H11 M7.5 7 V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  ),
  organizing: (
    <g>
      <rect x="4" y="6" width="7" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="6" width="7" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 10 H9 M6 13 H9 M15 10 H18 M15 13 H18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7.5 6 V4.5 M16.5 6 V4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  ),
  floor_cleaning: (
    <g>
      <path d="M4 18 H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6 18 L10 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.5 7.2 Q10.5 5.5 12.5 7.2 Q11.2 9.2 9.5 9 Q7.8 8.2 8.5 7.2Z" fill="currentColor" />
      <path d="M14 8 L15 10.5 L17.5 11.5 L15 12.5 L14 15 L13 12.5 L10.5 11.5 L13 10.5 Z" fill="currentColor" />
      <path d="M18 6 L18.5 7.3 L20 7.8 L18.5 8.3 L18 9.6 L17.5 8.3 L16 7.8 L17.5 7.3 Z" fill="currentColor" />
    </g>
  ),
};

export default function ServiceIcon({ id, size = 28, className = '' }) {
  const mark = ICONS[id] || ICONS.house_cleaning;
  return (
    <svg
      className={`service-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {mark}
    </svg>
  );
}
