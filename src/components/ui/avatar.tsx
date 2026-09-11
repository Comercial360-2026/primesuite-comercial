const N_TONOS = 8;

// Hash determinista (no aleatorio): el mismo nombre siempre cae en el mismo
// tono, en cualquier pantalla y en cualquier sesión — es lo que hace que un
// avatar sirva para reconocer a alguien de un vistazo. FNV-1a de 32 bits,
// de sobra para 8 cubetas sin necesidad de criptografía.
function tonoDe(nombre: string): number {
  let h = 2166136261;
  for (let i = 0; i < nombre.length; i++) {
    h ^= nombre.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % N_TONOS + 1;
}

// Primera letra del nombre + primera del último apellido/palabra — igual
// que iOS/Gmail. Con una sola palabra, sus dos primeras letras.
function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0] + partes[partes.length - 1]![0]).toUpperCase();
}

interface Props {
  /** Nombre completo de la persona o empresa — decide iniciales y color. */
  nombre: string;
  /** `sm` (28px) en una fila de lista; `md` (40px) junto a un título de
   *  cabecera de ficha. */
  size?: 'sm' | 'md';
}

// Identidad de persona (comercial o cliente): iniciales sobre un círculo de
// color por hash del nombre — nunca a mano, nunca aleatorio. Las iniciales
// son la segunda pista de accesibilidad sobre el color (regla de siempre,
// ver 08_sistema_diseno.md §"Color y accesibilidad"). Ver también
// §"Identidad de persona".
export function Avatar({ nombre, size = 'sm' }: Props) {
  return (
    <span className={`avatar avatar--${size} avatar--${tonoDe(nombre)}`} aria-hidden="true">
      {inicialesDe(nombre)}
    </span>
  );
}

/** El mismo color que pinta el `Avatar` de esta persona, como valor CSS
 *  (`var(--avatar-N)`) — para teñir con SU color algo que no es un avatar
 *  (p. ej. la barra de un gráfico "por comercial"). Mismo hash, así que
 *  identifica a la misma persona en cualquier sitio de la app. */
export function colorAvatarDe(nombre: string): string {
  return `var(--avatar-${tonoDe(nombre)})`;
}
