// Office Script «Cargar CSV CRM» — vive en Excel web (Automatizar) y lo
// ejecuta el flujo en la nube «PrimeNotes - CRM a Excel» sobre
// SharePoint › Dept DIG Departamento comercial - Spain › General › PrimeNotes ›
// PrimeNotes - CRM › PrimeNotes_CRM.xlsx. Esta copia es la de referencia.
//
// Vuelca un CSV (una parte) en la tabla `tabla` (hoja con el mismo nombre).
// El flujo no garantiza el orden de las partes, así que no se fía de
// `reiniciar`: cada tabla guarda en la hoja oculta «_control» cuándo recibió
// su última parte. Si hace más de VENTANA_MIN, es una carga nueva → borra la
// hoja y la rehace con la cabecera de esta parte; si no, añade las filas.
// ponytail: relanzar el flujo antes de VENTANA_MIN duplicaría filas; si pasa,
// esperar la ventana o borrar la fila de la tabla en «_control».
// Las columnas `_x_value` pierden el guion bajo inicial (el filtro OData del
// conector de Excel no las admite). Todo como texto: ids, números de cuenta
// con ceros, etc. no se transforman.
const VENTANA_MIN = 10;

function main(workbook: ExcelScript.Workbook, tabla: string, csv: string, reiniciar: boolean): number {
  const filas = parsearCsv(csv.replace(/^\uFEFF/, ''));
  if (filas.length === 0) return 0;
  const cabecera = filas[0].map((c) => c.replace(/^_+/, ''));
  const ancho = cabecera.length;
  const datos = filas
    .slice(1)
    .filter((f) => !(f.length === 1 && f[0] === ''))
    .map((f) => {
      const r = f.slice(0, ancho);
      while (r.length < ancho) r.push('');
      return r;
    });

  const nueva = marcarCarga(workbook, tabla);
  let tabl = workbook.getTable(tabla);
  if (nueva || !tabl) {
    if (tabl) tabl.delete();
    const vieja = workbook.getWorksheet(tabla);
    if (vieja) vieja.delete();
    const hoja = workbook.addWorksheet(tabla);
    hoja.getRangeByIndexes(0, 0, datos.length + 2, ancho).setNumberFormatLocal('@');
    const primero = datos.slice(0, 2000);
    hoja.getRangeByIndexes(0, 0, 1 + primero.length, ancho).setValues([cabecera, ...primero]);
    tabl = hoja.addTable(hoja.getRangeByIndexes(0, 0, 1 + Math.max(primero.length, 1), ancho).getAddress(), true);
    tabl.setName(tabla);
    anadir(tabl, datos.slice(2000));
    const inicial = workbook.getWorksheet('Hoja1');
    if (inicial && workbook.getWorksheets().length > 1) inicial.delete();
  } else {
    anadir(tabl, datos);
  }
  return datos.length;
}

// Devuelve true si la última parte de `tabla` llegó hace más de VENTANA_MIN
// (o nunca), y apunta la hora de ahora.
function marcarCarga(workbook: ExcelScript.Workbook, tabla: string): boolean {
  let hoja = workbook.getWorksheet('_control');
  if (!hoja) {
    hoja = workbook.addWorksheet('_control');
    hoja.setVisibility(ExcelScript.SheetVisibility.hidden);
  }
  const rango = hoja.getRange('A1:B20');
  const valores = rango.getValues();
  const ahora = Date.now();
  let fila = valores.findIndex((v) => v[0] === tabla);
  let nueva = true;
  if (fila >= 0) nueva = ahora - Number(valores[fila][1]) > VENTANA_MIN * 60000;
  else fila = valores.findIndex((v) => v[0] === '');
  hoja.getRange(`A${fila + 1}:B${fila + 1}`).setValues([[tabla, ahora]]);
  return nueva;
}

// Añade en bloques de 2000, dando antes formato de texto a las filas nuevas
// (si no, Excel convierte "00123" en 123 o un id largo en notación científica).
function anadir(tabl: ExcelScript.Table, datos: string[][]) {
  const hoja = tabl.getWorksheet();
  const ancho = tabl.getHeaderRowRange().getColumnCount();
  for (let i = 0; i < datos.length; i += 2000) {
    const bloque = datos.slice(i, i + 2000);
    const fin = tabl.getRange();
    hoja.getRangeByIndexes(fin.getRowIndex() + fin.getRowCount(), fin.getColumnIndex(), bloque.length, ancho).setNumberFormatLocal('@');
    tabl.addRows(-1, bloque);
  }
}

// CSV con comillas: "" dentro de un campo = comilla; saltos de línea dentro
// de comillas se respetan (las descripciones de oportunidad los llevan).
function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}
