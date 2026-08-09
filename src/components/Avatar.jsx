function initials(name) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

/** `small` entspricht dem 34px-Avatar in der Mitarbeitendenliste. */
export default function Avatar({ name, role, small = false }) {
  const style = small ? { width: 34, height: 34, fontSize: 12 } : undefined;
  return (
    <div className={`sb-avatar sb-avatar-${role}`} style={style}>
      {initials(name)}
    </div>
  );
}
