interface IconProps {
  class?: string;
}

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.75',
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
};

export function SearchIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function PlusIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function MinusIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function ChevronDownIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ChevronUpIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function TrashIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z" />
      <line x1="9.5" y1="11" x2="9.5" y2="17" />
      <line x1="14.5" y1="11" x2="14.5" y2="17" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function LogoutIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <line x1="14" y1="12" x2="21" y2="12" />
      <polyline points="17 8 21 12 17 16" />
    </svg>
  );
}

export function ShoppingBagIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <path d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function ReceiptIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <path d="M6 3h12v17l-2.5-1.5L13 20l-2.5-1.5L8 20l-2-1.5V3Z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </svg>
  );
}

export function BluetoothIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <path d="M7 7l10 10-5 5V2l5 5L7 17" />
    </svg>
  );
}

export function CalendarIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

export function StoreIcon({ class: className }: IconProps) {
  return (
    <svg {...base} class={className}>
      <path d="M4 9l1-5h14l1 5" />
      <path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M5 9v10h14V9" />
      <line x1="10" y1="19" x2="10" y2="14" />
      <line x1="14" y1="19" x2="14" y2="14" />
    </svg>
  );
}
