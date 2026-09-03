import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './mapa-fotos.css';
import { enlaceMapa } from '@/lib/geo';

// Mapa con un pin por foto geolocalizada (captura_libre.latitud/longitud).
// Teselas de OpenStreetMap; el Service Worker las cachea al verlas (ver
// vite.config.ts), así que una zona ya visitada se ve sin cobertura.
// Marcador = un div con CSS (evita el lío de rutas de iconos de Leaflet
// con el bundler). Si no hay fotos con coordenadas, no pinta nada.

export interface FotoSituada {
  id: string;
  url: string | null;
  titulo: string | null;
  lat: number;
  lng: number;
}

export function MapaFotos({ fotos }: { fotos: FotoSituada[] }) {
  const contRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contRef.current || fotos.length === 0) return;

    const map = L.map(contRef.current, {
      attributionControl: false,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    const pin = L.divIcon({
      className: 'mapa-fotos__pin',
      html: '<span></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    const puntos: [number, number][] = [];
    for (const f of fotos) {
      puntos.push([f.lat, f.lng]);
      const cont = document.createElement('div');
      cont.className = 'mapa-fotos__popup';
      if (f.url) {
        const img = document.createElement('img');
        img.src = f.url;
        img.alt = f.titulo ?? 'foto';
        cont.appendChild(img);
      }
      const cap = document.createElement('div');
      cap.className = 'mapa-fotos__popup-cap';
      cap.textContent = f.titulo || 'Foto';
      cont.appendChild(cap);
      const a = document.createElement('a');
      a.href = enlaceMapa(f.lat, f.lng);
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = 'Abrir en el mapa ↗';
      cont.appendChild(a);
      L.marker([f.lat, f.lng], { icon: pin }).addTo(map).bindPopup(cont, { closeButton: false });
    }

    if (puntos.length === 1) map.setView(puntos[0], 16);
    else map.fitBounds(L.latLngBounds(puntos), { padding: [28, 28], maxZoom: 17 });

    // El contenedor puede montarse con altura 0 dentro de un scroll.
    const t = window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      window.clearTimeout(t);
      map.remove();
    };
  }, [fotos]);

  if (fotos.length === 0) return null;
  return <div ref={contRef} className="mapa-fotos" role="img" aria-label={`Mapa con ${fotos.length} foto(s)`} />;
}
