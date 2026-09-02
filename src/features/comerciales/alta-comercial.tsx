import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { crearComercial, type RolComercial } from '@/lib/gestionar-comercial';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { Aviso } from '@/components/ui/aviso';

const ROLES: { valor: RolComercial; etiqueta: string }[] = [
  { valor: 'comercial', etiqueta: 'Comercial' },
  { valor: 'direccion_comercial', etiqueta: 'Dirección comercial' },
];

export function AltaComercial() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<RolComercial>('comercial');
  const [zona, setZona] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ action_link: string | null; aviso?: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const puedeGuardar = nombre.trim() && email.trim().includes('@') && !creando;

  async function crear() {
    if (!puedeGuardar) return;
    setCreando(true);
    setError(null);
    try {
      const { action_link, aviso } = await crearComercial({
        nombre: nombre.trim(),
        email: email.trim(),
        rol,
        zona_cartera: zona.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ['comerciales-equipo'] });
      queryClient.invalidateQueries({ queryKey: ['nombres-comerciales'] });
      setResultado({ action_link, aviso });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el comercial.');
    } finally {
      setCreando(false);
    }
  }

  async function copiar() {
    if (!resultado?.action_link) return;
    try {
      await navigator.clipboard.writeText(resultado.action_link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* si el navegador no deja copiar, el enlace se ve igual en pantalla */
    }
  }

  async function compartir() {
    if (!resultado?.action_link || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: 'Acceso a PrimeNotes',
        text: `${nombre.trim()}, entra en PrimeNotes y elige tu contraseña con este enlace (caduca en 1 hora):`,
        url: resultado.action_link,
      });
    } catch {
      /* el usuario canceló el diálogo de compartir */
    }
  }

  // Alta hecha: se enseña el enlace de un solo uso para dárselo al
  // comercial (WhatsApp, en persona…). Con él elige su contraseña.
  if (resultado) {
    const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Comercial creado" />
        <div className="lista-agrupada">
          <Aviso tipo="exito" titulo={`${nombre.trim()} está dada de alta`}>
            {resultado.action_link
              ? 'Pásale este enlace (WhatsApp, en persona…). Con él elige su contraseña. Caduca en 1 hora; si hace falta, se reenvía desde su ficha.'
              : (resultado.aviso ?? 'El comercial está creado. Reenvíale el enlace de acceso desde su ficha.')}
          </Aviso>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="label" style={{ marginTop: 0 }}>correo</div>
              <div style={{ fontSize: 'var(--text-base)' }}>{email.trim()}</div>
            </div>
            {resultado.action_link && (
              <>
                <div>
                  <div className="label">enlace de acceso</div>
                  <div className="enlace-copia">{resultado.action_link}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={copiar}>
                    {copiado ? 'Copiado ✓' : 'Copiar enlace'}
                  </button>
                  {puedeCompartir && (
                    <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={compartir}>
                      Compartir
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => navigate('/comerciales')}>
          Hecho
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Nuevo comercial" onVolver={() => navigate(-1)} />

      <div className="label" style={{ marginTop: 0 }}>nombre</div>
      <input
        className="field"
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="nombre y apellidos"
      />

      <div className="label">correo</div>
      <input
        className="field"
        type="email"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nombre@primion.com"
      />

      <div className="label">rol</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {ROLES.map((r) => (
          <button
            key={r.valor}
            type="button"
            className={`chip${rol === r.valor ? ' chip--on' : ''}`}
            onClick={() => setRol(r.valor)}
          >
            {r.etiqueta}
          </button>
        ))}
      </div>

      <div className="label">zona / cartera (opcional)</div>
      <input
        className="field"
        value={zona}
        onChange={(e) => setZona(e.target.value)}
        placeholder="p. ej. Cataluña, Grandes cuentas…"
      />

      {error && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} disabled={!puedeGuardar} onClick={crear}>
        {creando ? 'Creando…' : 'Crear comercial'}
      </button>
    </div>
  );
}
