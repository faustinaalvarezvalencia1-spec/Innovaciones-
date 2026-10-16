import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { UNIDADES, type Movimiento, type Producto, type Proveedor, type TipoMovimiento } from '../lib/tipos'
import { fechaCorta, hoy, leerCantidad, mensajeError, numero, pesos, semanaDeConteo } from '../lib/formato'
import { Aviso, CampoDinero, Cargando, Dialogo, useToast } from '../componentes/ui'
import { useSesion } from '../componentes/Sesion'
import { Icono } from '../componentes/Icono'

type Pestana = 'buscar' | 'conteo' | 'critico' | 'movimientos'

const COLUMNAS = 'id, nombre, referencia, categoria, subcategoria, unidad, costo_unitario, precio, stock_exhibicion, stock_reserva_clases, minimo, ultimo_conteo, remate, grupo_conteo, proveedor_id, activo'

export function unidadCorta(u: string) {
  return ({ Gramo: 'g', Unidad: 'u', Metro: 'm' } as Record<string, string>)[u] ?? u.toLowerCase()
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Inventario() {
  const [pestana, setPestana] = useState<Pestana>('buscar')
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [elegido, setElegido] = useState<Producto | null>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('productos').select(COLUMNAS).eq('activo', true).order('nombre').limit(2000)
    setProductos((data ?? []) as Producto[])
  }, [])
  useEffect(() => {
    cargar()
    supabase.from('proveedores').select('*').eq('activo', true).order('nombre').then(({ data }) => setProveedores((data ?? []) as Proveedor[]))
  }, [cargar])

  const actualizar = (p: Producto) => setProductos(prev => prev?.map(x => (x.id === p.id ? p : x)) ?? null)

  return (
    <>
      <div className="encabezado">
        <div><p className="antetitulo">Exhibición y reserva de clases</p><h1 className="impacto">Inventario</h1></div>
      </div>
      <div className="segmentos" role="tablist" style={{ marginBottom: 16 }}>
        {([['buscar', 'Buscar'], ['conteo', 'Conteo semanal'], ['critico', 'Stock crítico'], ['movimientos', 'Movimientos']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} aria-pressed={pestana === k} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>

      {!productos ? <Cargando /> : (
        <>
          {pestana === 'buscar' && <Buscar productos={productos} onElegir={setElegido} />}
          {pestana === 'conteo' && <Conteo productos={productos} onGuardado={cargar} />}
          {pestana === 'critico' && <Critico productos={productos} onElegir={setElegido} />}
          {pestana === 'movimientos' && <Movimientos />}
        </>
      )}

      {elegido && <FichaProducto producto={elegido} proveedores={proveedores}
        onCerrar={() => setElegido(null)} onCambio={p => { actualizar(p); setElegido(p) }} />}
    </>
  )
}

function filaStock(p: Producto) {
  const u = unidadCorta(p.unidad)
  const bajo = p.minimo > 0 && p.stock_exhibicion <= p.minimo
  return (
    <div className="derecha">
      <div className="cifra" style={{ color: bajo ? 'var(--alerta)' : undefined }}>{numero(p.stock_exhibicion)} {u}</div>
      <div className="muted" style={{ fontSize: 13 }}>Reserva {numero(p.stock_reserva_clases)} {u}</div>
    </div>
  )
}

function Buscar({ productos, onElegir }: { productos: Producto[]; onElegir: (p: Producto) => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'Todas' | 'Miyuki' | 'Herramientas'>('Todas')
  const resultados = useMemo(() => {
    const t = normalizar(q.trim())
    return productos.filter(p => (cat === 'Todas' || p.categoria === cat)
      && (!t || normalizar(`${p.referencia ?? ''} ${p.nombre} ${p.subcategoria ?? ''}`).includes(t)))
  }, [productos, q, cat])
  const visibles = resultados.slice(0, 60)

  return (
    <section className="tarjeta">
      <div className="buscador">
        <Icono nombre="buscar" />
        <input className="entrada" type="search" placeholder="Referencia o nombre (ej. DB-0767, tila, pinza)"
          aria-label="Buscar producto" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      </div>
      <div className="segmentos" style={{ margin: '12px 0' }}>
        {(['Todas', 'Miyuki', 'Herramientas'] as const).map(c => (
          <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>
        {resultados.length} productos{resultados.length > visibles.length ? `, se muestran ${visibles.length}. Escribe más para filtrar.` : ''}
      </p>
      <ul className="lista">
        {visibles.map(p => (
          <li key={p.id}>
            <button className="boton texto" style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left', color: 'inherit', padding: 0, minHeight: 0 }}
              onClick={() => onElegir(p)}>
              <span className="principal">
                <strong>{p.referencia ? <>{p.referencia} · </> : null}<span style={{ fontWeight: 500 }}>{p.nombre}</span></strong>
                <span className="muted" style={{ fontSize: 13 }}>{p.subcategoria} · {p.grupo_conteo} · {pesos(p.precio)}</span>
              </span>
            </button>
            {filaStock(p)}
          </li>
        ))}
      </ul>
      {resultados.length === 0 && <p className="vacio">No encontramos productos con “{q}”.</p>}
    </section>
  )
}

function Critico({ productos, onElegir }: { productos: Producto[]; onElegir: (p: Producto) => void }) {
  const criticos = productos.filter(p => p.minimo > 0 && p.stock_exhibicion <= p.minimo)
    .sort((a, b) => a.stock_exhibicion / a.minimo - b.stock_exhibicion / b.minimo)
  const sinMinimo = productos.filter(p => !p.minimo).length
  return (
    <section className="tarjeta">
      <h2>Stock crítico</h2>
      {sinMinimo > 0 && <Aviso tipo="info">{sinMinimo} de {productos.length} productos no tienen mínimo definido, así que no pueden aparecer aquí. Ponles mínimo desde la ficha del producto.</Aviso>}
      {criticos.length === 0 ? <p className="vacio">No hay productos en o por debajo del mínimo.</p> : (
        <ul className="lista">
          {criticos.map(p => (
            <li key={p.id}>
              <button className="boton texto" style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left', color: 'inherit', padding: 0, minHeight: 0 }}
                onClick={() => onElegir(p)}>
                <span className="principal">
                  <strong>{p.referencia ?? p.nombre}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>Mínimo {numero(p.minimo)} {unidadCorta(p.unidad)} · {p.nombre}</span>
                </span>
              </button>
              {filaStock(p)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Conteo({ productos, onGuardado }: { productos: Producto[]; onGuardado: () => void }) {
  const { sesion } = useSesion()
  const toast = useToast()
  const [semana, setSemana] = useState<string>(`Semana ${semanaDeConteo(hoy())}`)
  const [q, setQ] = useState('')
  const [valores, setValores] = useState<Record<string, string>>({})
  const [confirmar, setConfirmar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const grupo = useMemo(() => {
    const t = normalizar(q.trim())
    return productos.filter(p => p.grupo_conteo === semana && (!t || normalizar(`${p.referencia ?? ''} ${p.nombre}`).includes(t)))
      .sort((a, b) => (a.subcategoria ?? '').localeCompare(b.subcategoria ?? '') || (a.referencia ?? a.nombre).localeCompare(b.referencia ?? b.nombre, 'es', { numeric: true }))
  }, [productos, semana, q])

  const contados = Object.entries(valores)
    .map(([id, v]) => ({ p: productos.find(x => x.id === id)!, n: leerCantidad(v) }))
    .filter((x): x is { p: Producto; n: number } => x.p != null && x.n != null && x.n >= 0)
  const yaContadosHoy = productos.filter(p => p.grupo_conteo === semana && p.ultimo_conteo === hoy()).length

  async function guardar() {
    setGuardando(true); setError(null)
    const filas = contados.map(({ p, n }) => ({
      producto_id: p.id, tipo: 'Conteo', cantidad: n, ubicacion: 'Exhibición', fecha: hoy(), creado_por: sesion!.user.id,
      motivo: `Conteo ${semana}`,
    }))
    const { error } = await supabase.from('movimientos_inventario').insert(filas)
    setGuardando(false)
    if (error) { setError(mensajeError(error)); return }
    toast(`${filas.length} conteos guardados`)
    setValores({}); setConfirmar(false); onGuardado()
  }

  return (
    <section className="tarjeta">
      <div className="encabezado" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Conteo de exhibición</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>Escribe lo que cuentas. El stock queda en ese valor. Deja vacío lo que no contaste.</p>
        </div>
        <div className="segmentos">
          {['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'].map(s => (
            <button key={s} aria-pressed={semana === s} onClick={() => { setSemana(s); setValores({}) }}>{s}</button>
          ))}
        </div>
      </div>
      <div className="buscador" style={{ marginBottom: 8 }}>
        <Icono nombre="buscar" />
        <input className="entrada" type="search" placeholder="Filtrar este grupo" aria-label="Filtrar productos del grupo"
          value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <p className="muted" style={{ fontSize: 14 }}>{grupo.length} productos en {semana.toLowerCase()} · {yaContadosHoy} contados hoy</p>
      <ul className="lista">
        {grupo.map(p => {
          const v = valores[p.id] ?? ''
          const n = leerCantidad(v)
          const dif = n != null ? n - p.stock_exhibicion : null
          return (
            <li key={p.id}>
              <div className="principal">
                <strong>{p.referencia ?? p.nombre}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  Sistema: {numero(p.stock_exhibicion)} {unidadCorta(p.unidad)}
                  {p.ultimo_conteo ? ` · contado ${fechaCorta(p.ultimo_conteo)}` : ' · nunca contado'}
                  {dif != null && dif !== 0 && <strong style={{ color: dif < 0 ? 'var(--alerta)' : 'var(--ok)' }}> · {dif > 0 ? '+' : ''}{numero(dif)}</strong>}
                </span>
              </div>
              <input className="entrada" style={{ width: 120, textAlign: 'right', minHeight: 48 }} inputMode="decimal"
                aria-label={`Cantidad contada de ${p.referencia ?? p.nombre} en ${p.unidad.toLowerCase()}s`}
                placeholder={unidadCorta(p.unidad)} value={v}
                onChange={e => setValores(prev => ({ ...prev, [p.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
            </li>
          )
        })}
      </ul>
      <div className="acciones" style={{ position: 'sticky', bottom: 80, background: 'var(--blanco)', paddingTop: 8 }}>
        <button className="boton bloque" disabled={contados.length === 0} onClick={() => setConfirmar(true)}>
          Guardar {contados.length || ''} conteo{contados.length === 1 ? '' : 's'}
        </button>
      </div>

      {confirmar && (
        <Dialogo titulo={`Guardar ${contados.length} conteos`} onCerrar={() => setConfirmar(false)}>
          <p className="muted" style={{ marginTop: 0 }}>El stock de exhibición queda en lo contado. Las diferencias:</p>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead><tr><th>Producto</th><th className="num">Sistema</th><th className="num">Contado</th><th className="num">Dif.</th></tr></thead>
              <tbody>
                {contados.map(({ p, n }) => (
                  <tr key={p.id}>
                    <td>{p.referencia ?? p.nombre}</td>
                    <td className="num">{numero(p.stock_exhibicion)}</td>
                    <td className="num cifra">{numero(n)}</td>
                    <td className="num">{numero(n - p.stock_exhibicion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="acciones">
            <button className="boton" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar conteos'}</button>
            <button className="boton contorno" onClick={() => setConfirmar(false)}>Volver</button>
          </div>
        </Dialogo>
      )}
    </section>
  )
}

function Movimientos() {
  const [movs, setMovs] = useState<Movimiento[] | null>(null)
  useEffect(() => {
    supabase.from('movimientos_inventario').select('*, productos(nombre, referencia, unidad)')
      .order('creado_en', { ascending: false }).limit(50).then(({ data }) => setMovs((data ?? []) as Movimiento[]))
  }, [])
  if (!movs) return <Cargando />
  return (
    <section className="tarjeta">
      <h2>Últimos movimientos</h2>
      {movs.length === 0 ? <p className="vacio">Todavía no hay movimientos.</p> : (
        <ul className="lista">
          {movs.map(m => (
            <li key={m.id}>
              <div className="principal">
                <strong>{m.tipo} · {m.productos?.referencia ?? m.productos?.nombre}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  {fechaCorta(m.fecha)} · {m.ubicacion}{m.clase_tecnica ? ` · ${m.clase_tecnica}` : ''}{m.motivo ? ` · ${m.motivo}` : ''}
                </span>
              </div>
              <div className="derecha">
                <div className="cifra">{m.tipo === 'Conteo' ? '=' : ['Consumo en clase', 'Daño/merma'].includes(m.tipo) ? '−' : m.cantidad < 0 ? '' : '+'}{numero(m.cantidad)} {unidadCorta(m.productos?.unidad ?? '')}</div>
                <div className="muted" style={{ fontSize: 13 }}>{numero(m.stock_anterior)} → {numero(m.stock_resultante)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const ACCIONES: { tipo: TipoMovimiento; texto: string; admin?: boolean }[] = [
  { tipo: 'Entrada compra', texto: 'Entrada de compra' },
  { tipo: 'Traslado a reserva clases', texto: 'Pasar a reserva de clases' },
  { tipo: 'Consumo en clase', texto: 'Consumo en clase' },
  { tipo: 'Daño/merma', texto: 'Daño o merma' },
  { tipo: 'Conteo', texto: 'Conteo' },
  { tipo: 'Ajuste', texto: 'Ajuste', admin: true },
]

function FichaProducto({ producto: p, proveedores, onCerrar, onCambio }: {
  producto: Producto; proveedores: Proveedor[]; onCerrar: () => void; onCambio: (p: Producto) => void
}) {
  const { esAdmin, sesion } = useSesion()
  const toast = useToast()
  const [tipo, setTipo] = useState<TipoMovimiento | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [ubicacion, setUbicacion] = useState<'Exhibición' | 'Reserva clases'>('Exhibición')
  const [costo, setCosto] = useState(p.costo_unitario ?? 0)
  const [proveedorId, setProveedorId] = useState(p.proveedor_id ?? '')
  const [clase, setClase] = useState('')
  const [motivo, setMotivo] = useState('')
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const u = unidadCorta(p.unidad)

  const n = leerCantidad(cantidad)
  const ubic = tipo === 'Traslado a reserva clases' || tipo === 'Consumo en clase' ? 'Reserva clases'
    : tipo === 'Entrada compra' ? 'Exhibición' : ubicacion
  const actual = ubic === 'Exhibición' ? p.stock_exhibicion : p.stock_reserva_clases
  const despues = n == null || !tipo ? null
    : tipo === 'Conteo' ? n
    : tipo === 'Entrada compra' || tipo === 'Ajuste' || tipo === 'Traslado a reserva clases' ? actual + n
    : actual - n
  const pideMotivo = tipo === 'Ajuste' || tipo === 'Daño/merma'
  const valido = tipo && n != null && (tipo === 'Conteo' ? n >= 0 : tipo === 'Ajuste' ? n !== 0 : n > 0)
    && (!pideMotivo || motivo.trim().length >= 5)
    && (tipo !== 'Traslado a reserva clases' || n <= p.stock_exhibicion)
    && (despues == null || despues >= 0)

  async function guardar() {
    if (!tipo || n == null) return
    setGuardando(true); setError(null)
    const { error } = await supabase.from('movimientos_inventario').insert({
      producto_id: p.id, tipo, cantidad: n, ubicacion: ubic, fecha: hoy(), creado_por: sesion!.user.id,
      costo_unitario: tipo === 'Entrada compra' && costo > 0 ? costo : null,
      proveedor_id: tipo === 'Entrada compra' && proveedorId ? proveedorId : null,
      clase_tecnica: tipo === 'Consumo en clase' ? clase.trim() || null : null,
      motivo: motivo.trim() || null,
    })
    if (error) { setGuardando(false); setError(mensajeError(error)); return }
    const { data } = await supabase.from('productos').select(COLUMNAS).eq('id', p.id).single()
    setGuardando(false)
    toast(`${tipo} registrado`)
    if (data) onCambio(data as Producto)
    setTipo(null); setCantidad(''); setMotivo(''); setClase('')
  }

  return (
    <Dialogo titulo={p.referencia ?? p.nombre} onCerrar={onCerrar}>
      <p style={{ marginTop: 0 }}>{p.nombre}<br /><span className="muted">{p.subcategoria} · {p.grupo_conteo} · {pesos(p.precio)} por {p.unidad.toLowerCase()}</span></p>
      <div className="rejilla dos" style={{ marginBottom: 16 }}>
        <div className="tarjeta suave" style={{ padding: 14 }}><p className="antetitulo">Exhibición</p><div className="cifra" style={{ fontSize: 26 }}>{numero(p.stock_exhibicion)} {u}</div></div>
        <div className="tarjeta fria" style={{ padding: 14 }}><p className="antetitulo" style={{ color: 'var(--gris)' }}>Reserva clases</p><div className="cifra" style={{ fontSize: 26 }}>{numero(p.stock_reserva_clases)} {u}</div></div>
      </div>
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>Mínimo {p.minimo ? `${numero(p.minimo)} ${u}` : 'sin definir'}
        {p.costo_unitario ? ` · costo ${pesos(p.costo_unitario)}` : ''}{p.ultimo_conteo ? ` · contado ${fechaCorta(p.ultimo_conteo)}` : ''}</p>

      {editando ? <EditarProducto p={p} onCerrar={() => setEditando(false)} onGuardado={x => { onCambio(x); setEditando(false) }} /> : (
        <>
          <div className="segmentos">
            {ACCIONES.filter(a => esAdmin || !a.admin).map(a => (
              <button key={a.tipo} aria-pressed={tipo === a.tipo} onClick={() => { setTipo(a.tipo); setError(null) }}>{a.texto}</button>
            ))}
          </div>

          {tipo && (
            <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
              {(tipo === 'Daño/merma' || tipo === 'Conteo' || tipo === 'Ajuste') && (
                <div className="segmentos" aria-label="Ubicación">
                  {(['Exhibición', 'Reserva clases'] as const).map(x => (
                    <button key={x} aria-pressed={ubicacion === x} onClick={() => setUbicacion(x)}>{x}</button>
                  ))}
                </div>
              )}
              <div className="campo">
                <label htmlFor="m-cant">{tipo === 'Conteo' ? `Cantidad contada (${p.unidad.toLowerCase()}s)` : tipo === 'Ajuste' ? `Cantidad a sumar o restar (usa −)` : `Cantidad (${p.unidad.toLowerCase()}s)`}</label>
                <input id="m-cant" className="entrada" inputMode={tipo === 'Ajuste' ? 'text' : 'decimal'} value={cantidad}
                  onChange={e => setCantidad(e.target.value)} autoFocus />
                {despues != null && (
                  <span className="ayuda" style={{ color: despues < 0 ? 'var(--alerta)' : undefined }}>
                    {tipo === 'Traslado a reserva clases'
                      ? `Exhibición ${numero(p.stock_exhibicion)} → ${numero(p.stock_exhibicion - (n ?? 0))} · Reserva ${numero(actual)} → ${numero(despues)}`
                      : `${ubic}: ${numero(actual)} → ${numero(despues)} ${u}`}
                    {despues < 0 && ' · No alcanza. Si el stock está mal, haz un conteo.'}
                  </span>
                )}
              </div>
              {tipo === 'Entrada compra' && (
                <div className="campos">
                  <CampoDinero id="m-costo" etiqueta={`Costo por ${p.unidad.toLowerCase()}`} valor={costo} onCambio={setCosto} />
                  <div className="campo">
                    <label htmlFor="m-prov">Proveedor</label>
                    <select id="m-prov" className="entrada" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                      <option value="">Sin proveedor</option>
                      {proveedores.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {tipo === 'Consumo en clase' && (
                <div className="campo">
                  <label htmlFor="m-clase">Clase o técnica</label>
                  <input id="m-clase" className="entrada" value={clase} onChange={e => setClase(e.target.value)} placeholder="Ej. Peyote, alambrismo" />
                </div>
              )}
              <div className="campo">
                <label htmlFor="m-motivo">Motivo{pideMotivo ? '' : ' (opcional)'}</label>
                <input id="m-motivo" className="entrada" value={motivo} onChange={e => setMotivo(e.target.value)} />
              </div>
              {error && <Aviso tipo="error">{error}</Aviso>}
              <div className="acciones" style={{ marginTop: 0 }}>
                <button className="boton" disabled={!valido || guardando} onClick={guardar}>{guardando ? 'Guardando…' : `Registrar ${tipo.toLowerCase()}`}</button>
              </div>
            </div>
          )}
          {esAdmin && <div className="acciones"><button className="boton texto" onClick={() => setEditando(true)}><Icono nombre="editar" tam={18} />Editar datos del producto</button></div>}
        </>
      )}
    </Dialogo>
  )
}

function EditarProducto({ p, onCerrar, onGuardado }: { p: Producto; onCerrar: () => void; onGuardado: (p: Producto) => void }) {
  const [minimo, setMinimo] = useState(p.minimo ? String(p.minimo) : '')
  const [unidad, setUnidad] = useState(p.unidad)
  const [precio, setPrecio] = useState(p.precio ?? 0)
  const [costo, setCosto] = useState(p.costo_unitario ?? 0)
  const [grupo, setGrupo] = useState(p.grupo_conteo ?? 'Semana 4')
  const [remate, setRemate] = useState(p.remate)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    const { data, error } = await supabase.from('productos').update({
      minimo: leerCantidad(minimo) ?? 0, unidad, precio: precio || null, costo_unitario: costo || null, grupo_conteo: grupo, remate,
    }).eq('id', p.id).select(COLUMNAS).single()
    if (error) setError(mensajeError(error)); else onGuardado(data as Producto)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="campos">
        <div className="campo">
          <label htmlFor="e-min">Mínimo ({unidadCorta(unidad)})</label>
          <input id="e-min" className="entrada" inputMode="decimal" value={minimo} onChange={e => setMinimo(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="e-uni">Unidad</label>
          <select id="e-uni" className="entrada" value={unidad} onChange={e => setUnidad(e.target.value)}>
            {UNIDADES.map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <CampoDinero id="e-precio" etiqueta="Precio" valor={precio} onCambio={setPrecio} />
        <CampoDinero id="e-costo" etiqueta="Costo" valor={costo} onCambio={setCosto} />
        <div className="campo">
          <label htmlFor="e-grupo">Grupo de conteo</label>
          <select id="e-grupo" className="entrada" value={grupo} onChange={e => setGrupo(e.target.value)}>
            {['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'].map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <label className="casilla"><input type="checkbox" checked={remate} onChange={e => setRemate(e.target.checked)} />En remate</label>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>El stock no se edita aquí: cambia solo con movimientos o conteos.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="acciones" style={{ marginTop: 0 }}>
        <button className="boton" onClick={guardar}>Guardar cambios</button>
        <button className="boton contorno" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  )
}
