// Rumbo (0-360°, desde el norte, sentido horario) hacia donde mira el móvil según la brújula
// (evento deviceorientationabsolute: alpha, beta, gamma en grados).
//  - De pie (soporte del salpicadero): mira hacia donde apunta su parte trasera, la cámara, que da a la carretera.
//  - Tumbado: hacia donde apunta su parte de arriba.
// Ejes y rotación Z-X'-Y'' de la especificación W3C DeviceOrientation.
export function phoneHeading(alpha, beta, gamma) {
  const r = Math.PI / 180;
  const [cX, sX, cY, sY, cZ, sZ] = [Math.cos(beta * r), Math.sin(beta * r), Math.cos(gamma * r), Math.sin(gamma * r), Math.cos(alpha * r), Math.sin(alpha * r)];
  // Parte trasera (eje −z) proyectada sobre el suelo: componente este y norte.
  let east = -cZ * sY - sZ * sX * cY;
  let north = -sZ * sY + cZ * sX * cY;
  // Casi tumbado: la trasera mira al suelo y su proyección no indica nada; se usa la parte de arriba (eje y).
  if (Math.hypot(east, north) < 0.5) { east = -sZ * cX; north = cZ * cX; }
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}
