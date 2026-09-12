import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { esSinRed } from '@/lib/red';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { Icono } from '@/components/ui/iconos';
import { TextareaDictado, type RefCampoDictado } from '@/components/ui/campo-dictado';

interface ReportarProblemaHojaProps {
  comercialId: string;
  rol: string;
  onCerrar: () => void;
}

// Parte de "algo va mal" desde la pantalla "Yo". INSERT directo, sin cola
// offline: un fallo que no puedes contar hasta tener cobertura no corre
// prisa, y así evitamos partes a medias. `contexto` lleva versión, build,
// rol, navegador y URL para que Dirección pueda reproducirlo — los ve en su
// propia pantalla "Yo", no hay pantalla aparte.
export function ReportarProblemaHoja({ comercialId, rol, onCerrar }: ReportarProblemaHojaProps) {
  const [texto, setTexto] = useState('');
  const refDictado = useRef<RefCampoDictado>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    const limpio = (refDictado.current?.consolidar() ?? texto).trim();
    if (!limpio) return;
    if (!navigator.onLine) {
      setError('Sin conexión. Envíalo cuando tengas red.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('reporte_problema').insert({
        comercial_id: comercialId,
        texto: limpio,
        contexto: {
          version: __APP_VERSION__,
          build: __BUILD_DATE__,
          rol,
          plataforma: navigator.userAgent,
          url: window.location.href,
        },
      });
      if (err) throw new Error(err.message);
      setEnviado(true);
    } catch (err) {
      setError(
        esSinRed(err) ? 'Sin conexión. Envíalo cuando tengas red.' : 'No se pudo enviar. Inténtalo de nuevo.'
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <HojaSuperior titulo="Reportar un problema" onCerrar={onCerrar}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 8 }}>
        Cuenta qué esperabas y qué pasó. Se envía con la versión de la app y la pantalla en la que estás; lo ve
        Dirección.
      </div>
      <TextareaDictado
        ref={refDictado}
        rows={4}
        autoFocus
        valor={texto}
        onCambio={setTexto}
        placeholder="p. ej. al guardar una nota sin cobertura, el contador no bajó al volver la red"
        disabled={enviando || enviado}
      />
      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        disabled={!texto.trim() || enviando || enviado}
        onClick={enviar}
      >
        {enviado ? (
          <>
            <Icono nombre="check" size={16} /> Enviado
          </>
        ) : enviando ? (
          'Enviando…'
        ) : (
          'Enviar'
        )}
      </button>
      {enviado && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 8 }}>
          Gracias. Ya puedes cerrar esta hoja.
        </div>
      )}
      {error && (
        <div className="field-error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </HojaSuperior>
  );
}
