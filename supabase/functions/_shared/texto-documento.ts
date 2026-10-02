// Texto plano de un documento de visita (PDF, Word, Excel, PowerPoint, TXT, CSV)
// para dárselo al agente de «Pregunta a la IA». Sin texto (PDF escaneado,
// formato raro) devuelve ''. No lanza: un documento ilegible no tumba la consulta.

import JSZip from 'https://esm.sh/jszip@3.10.1';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';

const sinEtiquetas = (xml: string) =>
  xml
    .replace(/<\/(w:p|a:p|row|si)>/g, '\n')
    .replace(/<\/(w:tc|c)>/g, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function zipXml(bytes: Uint8Array, rutas: RegExp): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const nombres = Object.keys(zip.files).filter((n) => rutas.test(n)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const partes: string[] = [];
  for (const n of nombres) partes.push(sinEtiquetas(await zip.files[n].async('string')));
  return partes.join('\n');
}

export async function textoDeDocumento(bytes: Uint8Array, nombre: string): Promise<string> {
  const ext = nombre.toLowerCase().split('.').pop() ?? '';
  try {
    let t = '';
    if (ext === 'txt' || ext === 'csv') t = new TextDecoder().decode(bytes);
    else if (ext === 'docx') t = await zipXml(bytes, /^word\/document\.xml$/);
    else if (ext === 'pptx') t = await zipXml(bytes, /^ppt\/slides\/slide\d+\.xml$/);
    else if (ext === 'xlsx') t = await zipXml(bytes, /^xl\/sharedStrings\.xml$/);
    else if (ext === 'pdf') {
      const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true });
      t = text;
    }
    return t.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  } catch {
    return '';
  }
}
