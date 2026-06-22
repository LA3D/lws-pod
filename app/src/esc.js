// esc.js — quote-safe HTML escaper shared across all components
export const esc = s => String(s).replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]))
