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
