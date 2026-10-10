// "10.000" not "10000.00" — Indonesian Rupiah has no cents, and uses "." as the
// thousands separator.
export const formatMoney = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
