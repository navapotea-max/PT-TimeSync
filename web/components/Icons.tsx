/** ไอคอนเส้น (stroke) ชุดเดียวกันทั้งระบบ */
type P = { className?: string };
const base = (cls?: string) => ({
  className: cls ?? "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IconDashboard = ({ className }: P) => (<svg {...base(className)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>);
export const IconTable = ({ className }: P) => (<svg {...base(className)}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="21" /><line x1="15" y1="9" x2="15" y2="21" /></svg>);
export const IconClock = ({ className }: P) => (<svg {...base(className)}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>);
export const IconDatabase = ({ className }: P) => (<svg {...base(className)}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>);
export const IconPlay = ({ className }: P) => (<svg {...base(className)}><polygon points="6 4 19 12 6 20 6 4" /></svg>);
export const IconUsers = ({ className }: P) => (<svg {...base(className)}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
export const IconDownload = ({ className }: P) => (<svg {...base(className)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>);
export const IconShield = ({ className }: P) => (<svg {...base(className)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
export const IconMenu = ({ className }: P) => (<svg {...base(className)}><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>);
export const IconLogout = ({ className }: P) => (<svg {...base(className)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
export const IconLock = ({ className }: P) => (<svg {...base(className ?? "h-3 w-3")}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>);
export const IconX = ({ className }: P) => (<svg {...base(className)}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
export const IconPlus = ({ className }: P) => (<svg {...base(className)}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
export const IconSearch = ({ className }: P) => (<svg {...base(className)}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
export const IconPrinter = ({ className }: P) => (<svg {...base(className)}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>);
export const IconFile = ({ className }: P) => (<svg {...base(className)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>);
