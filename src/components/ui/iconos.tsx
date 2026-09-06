import type { ComponentType, SVGProps } from 'react';
import {
  Calendar,
  CalendarDays,
  Users,
  UsersRound,
  ListChecks,
  User,
  Download,
  Trash2,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  Check,
  Circle,
  CircleCheckBig,
  Plus,
  Pencil,
  FolderInput,
  Merge,
  Database,
  BookText,
  LifeBuoy,
  ChartColumnBig,
  Copy,
  LogOut,
  Info,
  TriangleAlert,
  CircleX,
  Minus,
  Play,
  Inbox,
  Camera,
  Mic,
  FileText,
  Search,
  Sparkles,
  Flag,
  CircleHelp,
  Route,
  Contact,
  MapPin,
  EllipsisVertical,
} from 'lucide-react';

// Set único de iconos de la app. Desde 2026-09-06 se apoya en `lucide-react`
// (trazo limpio y consistente, estilo SF Symbols) en vez de SVG dibujado a
// mano. La API no cambia: las pantallas piden el icono por nombre en español
// (`<Icono nombre="hoy" />`) y no saben de dónde sale el dibujo. Cambiar de
// set = reasignar aquí; ninguna pantalla se toca.
//
// Grosor 1.75 para acercarlo al peso del texto (lucide viene a 2). Todos
// heredan el color con `currentColor`.

type IconLucide = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

// Nombre en español (kebab-case si son dos palabras) -> componente de lucide.
// El comentario dice para qué se usa cada uno.
const registro = {
  hoy: Calendar, // Hoy / agenda del día (bottom nav)
  agenda: CalendarDays, // atajo a la agenda completa
  clientes: Users, // dos personas — relación comercial
  tareas: ListChecks, // "Pasos" — lista con checks
  yo: User, // pantalla "Yo" (bottom nav)
  descargar: Download,
  borrar: Trash2,

  chevron: ChevronRight, // ">" de las filas navegables
  subir: ChevronUp, // reordenar: subir una fila
  bajar: ChevronDown, // reordenar: bajar una fila
  atras: ArrowLeft, // "volver atrás" (flecha con asta, no chevron)

  check: Check, // "hecho" / completado
  circulo: Circle, // casilla sin marcar (FilaToggle)
  'check-circulo': CircleCheckBig, // casilla marcada (FilaToggle)

  mas: Plus, // crear / añadir
  editar: Pencil, // renombrar / editar en el sitio
  mover: FolderInput, // mover a otra categoría
  fusionar: Merge, // fusionar con un término existente
  almacenamiento: Database, // cuota / consumo de disco
  vocabulario: BookText, // catálogo de términos
  solicitudes: LifeBuoy, // solicitudes de ayuda / sustitución
  consumo: ChartColumnBig, // consumo por comercial (barras)
  duplicados: Copy, // clientes duplicados
  salir: LogOut, // cerrar sesión

  // Mensajes (componente Aviso) — formas distintas entre sí.
  info: Info,
  atencion: TriangleAlert,
  error: CircleX,
  guion: Minus, // estado neutro / en pausa
  reproducir: Play, // "en curso" (visita empezada) — se pinta relleno
  bandeja: Inbox, // estado vacío por defecto

  // Captura durante la visita.
  foto: Camera,
  audio: Mic,
  nota: FileText,
  hallazgo: Search, // algo observado sobre el terreno (lupa)
  oportunidad: Sparkles, // destello — mismo sentido que el acento --signal-600
  paso: Flag, // próximo paso — lo que queda pendiente al salir

  ayuda: CircleHelp, // "?" de ayuda
  recorrido: Route, // ruta / recorrido por zonas
  interlocutor: Contact, // persona con la que hablas en la visita
  ubicacion: MapPin, // chincheta de mapa
  equipo: UsersRound, // tú y tus compañeros (grupo)
  opciones: EllipsisVertical, // "más acciones sobre esto" (kebab)
} satisfies Record<string, IconLucide>;

export type NombreIcono = keyof typeof registro;

interface PropsIcono {
  nombre: NombreIcono;
  /** Lado del icono en px. Nav = 22; filas y botones de acción = 20. */
  size?: number;
}

export function Icono({ nombre, size = 20 }: PropsIcono) {
  const Componente = registro[nombre];
  // "reproducir" es un indicador macizo (como antes): triángulo relleno.
  const relleno = nombre === 'reproducir';
  return (
    <Componente
      size={size}
      strokeWidth={relleno ? 0 : 1.75}
      aria-hidden="true"
      {...(relleno ? { fill: 'currentColor' } : {})}
    />
  );
}

// Wrappers con nombre propio — los usa el bottom nav (layout-shell) y
// mi-espacio; mismo registro, solo fijan el tamaño por defecto de su sitio.
type PropsWrapper = { size?: number };

export const IconoHoy = ({ size = 22 }: PropsWrapper) => <Icono nombre="hoy" size={size} />;
export const IconoClientes = ({ size = 22 }: PropsWrapper) => <Icono nombre="clientes" size={size} />;
export const IconoTareas = ({ size = 22 }: PropsWrapper) => <Icono nombre="tareas" size={size} />;
export const IconoYo = ({ size = 22 }: PropsWrapper) => <Icono nombre="yo" size={size} />;
export const IconoDescargar = ({ size = 20 }: PropsWrapper) => <Icono nombre="descargar" size={size} />;
export const IconoBorrar = ({ size = 20 }: PropsWrapper) => <Icono nombre="borrar" size={size} />;
