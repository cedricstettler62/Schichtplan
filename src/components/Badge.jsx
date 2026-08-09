export default function Badge({ tone = "ink", children }) {
  return <span className={`sb-badge sb-badge-${tone}`}>{children}</span>;
}
