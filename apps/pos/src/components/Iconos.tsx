interface IconProps {
  size?: number;
  style?: React.CSSProperties;
}

const Ico = ({ d, size = 18, style, children }: IconProps & { d?: string; children?: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);

export const IcoBag   = (p: IconProps) => <Ico {...p}><path d="M6 7h12l-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></Ico>;
export const IcoPlus  = (p: IconProps) => <Ico {...p} d="M12 5v14M5 12h14" />;
export const IcoMinus = (p: IconProps) => <Ico {...p} d="M5 12h14" />;
export const IcoClose = (p: IconProps) => <Ico {...p} d="M6 6l12 12M18 6L6 18" />;
export const IcoCheck = (p: IconProps) => <Ico {...p} d="M5 12l5 5L20 7" />;
export const IcoPencil= (p: IconProps) => <Ico {...p} d="M4 20l4-1L20 7l-3-3L5 16l-1 4z" />;
export const IcoTrash = (p: IconProps) => <Ico {...p}><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"/></Ico>;
export const IcoPrint = (p: IconProps) => <Ico {...p}><path d="M6 9V4h12v5M6 18H4v-7h16v7h-2M8 14h8v6H8z"/></Ico>;
export const IcoOnline= (p: IconProps) => <Ico {...p}><path d="M5 12a10 10 0 0 1 14 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/></Ico>;
export const IcoOffline=(p: IconProps) => <Ico {...p}><path d="M5 12a10 10 0 0 1 14 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/><path d="M3 3l18 18"/></Ico>;

// Navegación / mosaico
export const IcoGrid    = (p: IconProps) => <Ico {...p}><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></Ico>;
export const IcoReceipt = (p: IconProps) => <Ico {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></Ico>;
export const IcoWallet  = (p: IconProps) => <Ico {...p}><path d="M3 7a2 2 0 0 1 2-2h12v3"/><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="16.5" cy="13.5" r="1.25"/></Ico>;
export const IcoBox     = (p: IconProps) => <Ico {...p}><path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/></Ico>;
export const IcoStore   = (p: IconProps) => <Ico {...p}><path d="M3 7l2-3h14l2 3M3 7v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V7M5 20V11M19 20V11M5 20h14"/></Ico>;
export const IcoChevron     = (p: IconProps) => <Ico {...p} d="M9 6l6 6-6 6" />;
export const IcoChevronLeft = (p: IconProps) => <Ico {...p} d="M15 6l-6 6 6 6" />;
export const IcoSun  = (p: IconProps) => <Ico {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></Ico>;
export const IcoMoon = (p: IconProps) => <Ico {...p} d="M20 14a8 8 0 1 1-8-10 6 6 0 0 0 8 10z" />;

// Caja / operaciones
export const IcoPower    = (p: IconProps) => <Ico {...p}><path d="M12 4v8"/><path d="M7 6a7 7 0 1 0 10 0"/></Ico>;
export const IcoLock     = (p: IconProps) => <Ico {...p}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></Ico>;
export const IcoBanknote = (p: IconProps) => <Ico {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/></Ico>;
export const IcoCard     = (p: IconProps) => <Ico {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></Ico>;
export const IcoSwap     = (p: IconProps) => <Ico {...p} d="M7 8h11l-3-3M17 16H6l3 3" />;
export const IcoClock    = (p: IconProps) => <Ico {...p}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></Ico>;

// Categorías del menú
export const IcoFlame     = (p: IconProps) => <Ico {...p}><path d="M12 2c.5 3.5 4 4.5 4 8a4 4 0 0 1-8 0c0-1.5.5-2 1-3 .5-1 1-2 1-3"/><path d="M9 16a3 3 0 0 0 6 0c0-1-.5-2-1.5-2.5"/></Ico>;
export const IcoDrumstick = (p: IconProps) => <Ico {...p}><path d="M15 4a5 5 0 0 1 5 5c0 2-1 4-3 4l-2 1-2 2-1 2-3 1-3-3 1-3 2-1 2-2 1-2c0-2 2-3 3-3z"/><path d="M9 14l-3 3-2 0 1-2 3-3"/></Ico>;
export const IcoPieces    = (p: IconProps) => <Ico {...p}><path d="M6 5h6l4 4v10H6z"/><path d="M12 5v4h4"/><path d="M8 12h6M8 15h4"/></Ico>;
export const IcoSandwich  = (p: IconProps) => <Ico {...p}><path d="M3 10c0-3 4-5 9-5s9 2 9 5"/><path d="M3 10v3h18v-3"/><path d="M3 13c2 3 6 4 9 4s7-1 9-4"/></Ico>;
export const IcoCup       = (p: IconProps) => <Ico {...p}><path d="M6 5h12l-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 5z"/><path d="M6 9h12"/></Ico>;
export const IcoImage     = (p: IconProps) => <Ico {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M4 17l5-5 4 4 3-3 4 4"/></Ico>;
