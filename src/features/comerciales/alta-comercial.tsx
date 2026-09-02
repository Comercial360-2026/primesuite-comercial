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
  const [passwordTemporal, setPasswordTemporal] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const puedeGuardar = nombre.trim() && email.trim().includes('@') && !creando;

  async function crear() {
    if (!puedeGuardar) return;
    setCreando(true);
    setError(null);
    try {
      const { password_temporal } = await crearComercial({
        nombre: nombre.trim(),
        email: email.trim(),
        rol,
        zona_cartera: zona.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ['comerciales-equipo'] });
      queryClient.invalidateQueries({ queryKey: ['nombres-comerciales'] });
      setPasswordTemporal(password_temporal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el comercial.');
    } finally {
      setCreando(false);
    }
  }

  async function copiar() {
    if (!passwordTemporal) return;
    try {
      await navigator.clipboard.writeText(passwordTemporal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* si el navegador no deja copiar, la contraseña se ve igual en pantalla */
    }
  }

  // Alta hecha: se enseña la contraseña temporal para dársela al comercial.
  // No se puede volver a ver — de ahí el aviso.
  if (passwordTemporal) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Comercial creado" />
        <div className="lista-agrupada">
          <Aviso tipo="exito" titulo={`${nombre.trim()} ya puede entrar`}>
            Pásale estos datos. La contraseña temporal <strong>no se vuelve a mostrar</strong>; si se pierde,
            tendrás que restablecerla.
          </Aviso>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div className="label" style={{ marginTop: 0 }}>correo</div>
              <div style={{ fontSize: 'var(--text-base)' }}>{email.trim()}</div>
            </div>
            <div>
              <div className="label">contraseña temporal</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '0.02em' }}>
                {passwordTemporal}
              </div>
            </div>
            <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={copiar}>
              {copiado ? 'Copiada ✓' : 'Copiar contraseña'}
            </button>
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
