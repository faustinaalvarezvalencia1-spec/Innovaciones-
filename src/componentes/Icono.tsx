// Iconos de línea 2px, puntas redondeadas, sin relleno (README: Iconografía).
const trazos: Record<string, string> = {
  inicio: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5',
  caja: 'M3 7h18v12H3zM3 11h18M8 15h3',
  gasto: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  inventario: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  ajustes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  salir: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  camara: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  alerta: 'M12 4 2.5 20h19zM12 10v4M12 17.5v.01',
  ok: 'M5 12.5 10 17 19 7',
  mas: 'M12 5v14M5 12h14',
  externo: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  cerrar: 'M6 6l12 12M18 6 6 18',
  editar: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  documento: 'M6 3h8l4 4v14H6zM14 3v4h4',
  flecha: 'M9 6l6 6-6 6',
  reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
}

export function Icono({ nombre, tam = 22, titulo }: { nombre: keyof typeof trazos | string; tam?: number; titulo?: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={titulo ? undefined : true} role={titulo ? 'img' : undefined}>
      {titulo && <title>{titulo}</title>}
      <path d={trazos[nombre] ?? ''} />
    </svg>
  )
}
