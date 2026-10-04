// ¿Hay alguien más, aparte de `excluirId`, activo con rol Dirección Comercial?
export async function hayOtraDireccionActiva(
  admin: { from: (t: string) => any },
  excluirId: string
): Promise<boolean> {
  const { data } = await admin
    .from('comercial')
    .select('id')
    .eq('rol', 'direccion_comercial')
    .eq('activo', true)
    .neq('id', excluirId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
