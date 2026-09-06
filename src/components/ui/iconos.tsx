import type { ComponentType } from 'react';
import {
  CalendarCheck,
  CalendarDots,
  Users,
  UsersThree,
  ListChecks,
  User,
  DownloadSimple,
  Trash,
  CaretRight,
  CaretUp,
  CaretDown,
  ArrowLeft,
  Check,
  Circle,
  CheckCircle,
  Plus,
  PencilSimple,
  ArrowLineRight,
  ArrowsMerge,
  Database,
  BookOpenText,
  Lifebuoy,
  ChartBar,
  CopySimple,
  SignOut,
  Info,
  Warning,
  XCircle,
  Minus,
  Play,
  Tray,
  Camera,
  Microphone,
  Note,
  MagnifyingGlass,
  Eye,
  Sparkle,
  Flag,
  Question,
  Path,
  ChatCircleText,
  MapPin,
  DotsThreeVertical,
  type IconProps,
} from '@phosphor-icons/react';

// Set único de iconos de la app. Desde 2026-09-06 se apoya en Phosphor
// Icons (`@phosphor-icons/react`) — el set libre más cercano a SF Symbols:
// varios pesos (regular / fill / duotone), esquinas suaves, geometría
// óptica consistente. La API no cambia: las pantallas piden el icono por
// nombre en español (`<Icono nombre="hoy" />`) y no saben de dónde sale el
// dibujo. El bottom nav pasa `activo` a sus wrappers para que el icono de
// la sección actual se pinte relleno (patrón iOS).

type IconoPhosphor = ComponentType<IconProps>;

// Nombre en español (kebab-case si son dos palabras) -> componente Phosphor.
const registro = {
  hoy: CalendarCheck, // Hoy / agenda del día (bottom nav)
  agenda: CalendarDots, // atajo a la agenda completa
  clientes: Users, // dos personas — relación comercial
  tareas: ListChecks, // "Pasos"
  yo: User, // pantalla "Yo" (bottom nav)
  descargar: DownloadSimple,
  borrar: Trash,

  chevron: CaretRight, // ">" de las filas navegables
  subir: CaretUp, // reordenar: subir una fila
  bajar: CaretDown, // reordenar: bajar una fila
  atras: ArrowLeft, // "volver atrás"

  check: Check, // "hecho" / completado
  circulo: Circle, // casilla sin marcar (FilaToggle)
  'check-circulo': CheckCircle, // casilla marcada (FilaToggle)

  mas: Plus, // crear / añadir
  editar: PencilSimple, // renombrar / editar en el sitio
  mover: ArrowLineRight, // mover a otra categoría
  fusionar: ArrowsMerge, // fusionar con un término existente
  almacenamiento: Database, // cuota / consumo de disco
  vocabulario: BookOpenText, // catálogo de términos
  solicitudes: Lifebuoy, // solicitudes de ayuda / sustitución
  consumo: ChartBar, // consumo por comercial (barras)
  duplicados: CopySimple, // clientes duplicados
  salir: SignOut, // cerrar sesión

  // Mensajes (componente Aviso) — formas distintas entre sí.
  info: Info,
  atencion: Warning,
  error: XCircle,
  guion: Minus, // estado neutro / en pausa
  reproducir: Play, // "en curso" (visita empezada) — se pinta relleno
  bandeja: Tray, // estado vacío por defecto

  // Captura durante la visita.
  foto: Camera,
  audio: Microphone,
  nota: Note,
  buscar: MagnifyingGlass, // lupa de búsqueda (cabeceras, listados)
  hallazgo: Eye, // algo observado sobre el terreno (NO la lupa: esa es `buscar`)
  oportunidad: Sparkle, // destello — mismo sentido que el acento --signal-600
  paso: Flag, // próximo paso — lo que queda pendiente al salir

  ayuda: Question, // "?" de ayuda
  recorrido: Path, // ruta / recorrido por zonas
  interlocutor: ChatCircleText, // persona con la que hablas en la visita
  ubicacion: MapPin, // chincheta de mapa
  equipo: UsersThree, // tú y tus compañeros (grupo)
  opciones: DotsThreeVertical, // "más acciones sobre esto" (kebab)
} satisfies Record<string, IconoPhosphor>;

export type NombreIcono = keyof typeof registro;

interface PropsIcono {
  nombre: NombreIcono;
  /** Lado del icono en px. Nav = 24; filas y botones de acción = 20. */
  size?: number;
  /** Peso Phosphor. Por defecto 'regular'; el bottom nav usa 'fill' en la sección activa. */
  weight?: IconProps['weight'];
}

export function Icono({ nombre, size = 20, weight }: PropsIcono) {
  const Componente = registro[nombre];
  // "reproducir" es un indicador macizo (como antes): triángulo relleno.
  const w = weight ?? (nombre === 'reproducir' ? 'fill' : 'regular');
  return <Componente size={size} weight={w} aria-hidden />;
}

// Wrappers del bottom nav (layout-shell) y mi-espacio. `activo` -> relleno,
// como iOS: la sección en la que estás se pinta sólida.
type PropsWrapper = { size?: number; activo?: boolean };
const pesoNav = (activo?: boolean): IconProps['weight'] => (activo ? 'fill' : 'regular');

export const IconoHoy = ({ size = 24, activo }: PropsWrapper) => (
  <Icono nombre="hoy" size={size} weight={pesoNav(activo)} />
);
export const IconoClientes = ({ size = 24, activo }: PropsWrapper) => (
  <Icono nombre="clientes" size={size} weight={pesoNav(activo)} />
);
export const IconoTareas = ({ size = 24, activo }: PropsWrapper) => (
  <Icono nombre="tareas" size={size} weight={pesoNav(activo)} />
);
export const IconoYo = ({ size = 24, activo }: PropsWrapper) => (
  <Icono nombre="yo" size={size} weight={pesoNav(activo)} />
);
export const IconoDescargar = ({ size = 20 }: PropsWrapper) => <Icono nombre="descargar" size={size} />;
export const IconoBorrar = ({ size = 20 }: PropsWrapper) => <Icono nombre="borrar" size={size} />;
