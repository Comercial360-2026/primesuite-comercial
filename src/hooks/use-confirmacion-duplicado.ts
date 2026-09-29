import { useEffect, useState } from 'react';

// Confirmar un posible duplicado vale solo para lo que se comprobó en ese
// momento: si `resetKey` cambia (se reescribe el nombre, se cambia de
// cliente…) hay que volver a preguntar.
export function useConfirmacionDuplicado(resetKey: unknown) {
  const [confirmado, setConfirmado] = useState(false);
  useEffect(() => setConfirmado(false), [resetKey]);
  return [confirmado, () => setConfirmado(true)] as const;
}
