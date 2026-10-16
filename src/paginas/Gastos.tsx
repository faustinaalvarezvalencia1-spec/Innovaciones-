import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIAS_GASTO, MEDIOS_PAGO, type Gasto, type GastoFijo, type Proveedor } from '../lib/tipos'
import { fechaCorta, hoy, leerPesos, mensajeError, mesSiguiente, nombreMes, pesos, primerDiaMes } from '../lib/formato'
import { Aviso, CampoDinero, Dialogo, useToast } from '../componentes/ui'
import { useSesion } from '../componentes/Sesion'
import { Icono } from '../componentes/Icono'
import { SelectorMes } from '../componentes/SelectorMes'

const OTRO = '__otro__'

interface Formulario {
  fecha: string; gastoFijoId: string; categoria: string; tipo: 'Fijo' | 'Variable'
  proveedorId: string; beneficiario: string; concepto: string; valor: number; medio: string; estimado: boolean
}

const nuevo = (): Formulario => ({
  fecha: hoy(), gastoFijoId: '', categoria: '', tipo: 'Variable', proveedorId: '', beneficiario: '',
  concepto: '', valor: 0, medio: 'Efectivo de caja', estimado: false,
})

export function Gastos() {
  const { sesion } = useSesion()
  const toast = useToast()
  const [f, setF] = useState<Formulario>(nuevo())
  const [foto, setFoto] = useState<File | null>(null)
  const [vistaFoto, setVistaFoto] = useState<string | null>(null)
  const [fijos, setFijos] = useState<GastoFijo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [mes, setMes] = useState(primerDiaMes(hoy()))
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [confirmar, setConfirmar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<Gasto | null>(null)

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    supabase.from('gastos_fijos').select('*').eq('activo', true).order('nombre').then(({ data }) => setFijos((data ?? []) as GastoFijo[]))
    supabase.from('proveedores').select('*').eq('activo', true).order('nombre').then(({ data }) => setProveedores((data ?? []) as Proveedor[]))
  }, [])

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('gastos').select('*, proveedores(nombre)')
      .gte('fecha', mes).lt('fecha', mesSiguiente(mes)).order('fecha', { ascending: false }).order('creado_en', { ascending: false })
    setGastos((data ?? []) as Gasto[])
  }, [mes])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!foto || !foto.type.startsWith('image/')) { setVistaFoto(null); return }
    const url = URL.createObjectURL(foto); setVistaFoto(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  function elegirFijo(id: string) {
    const g = fijos.find(x => x.id === id)
    if (!g) { set('gastoFijoId', ''); return }
    setF(p => ({
      ...p, gastoFijoId: id, categoria: g.categoria, tipo: 'Fijo',
      concepto: `${g.nombre} ${nombreMes(primerDiaMes(p.fecha)).toLowerCase()}`,
      valor: g.frecuencia === 'Mensual' ? g.valor_estimado : p.valor,
      beneficiario: g.categoria === 'Nómina' ? 'Bryan' : p.beneficiario,
      proveedorId: g.categoria === 'Nómina' ? OTRO : p.proveedorId,
    }))
  }

  const faltan = useMemo(() => {
    const x: string[] = []
    if (!f.categoria) x.push('categoría')
    if (!f.proveedorId || (f.proveedorId === OTRO && !f.beneficiario.trim())) x.push('proveedor o beneficiario')
    if (!f.concepto.trim()) x.push('concepto')
    if (f.valor <= 0) x.push('valor')
    return x
  }, [f])

  async function guardar() {
    setGuardando(true); setError(null)
    try {
      let soporte: string | null = null
      if (foto) {
        const ext = (foto.name.split('.').pop() || 'jpg').toLowerCase()
        const ruta = `${f.fecha.slice(0, 4)}/${f.fecha.slice(5, 7)}/${crypto.randomUUID()}.${ext}`
        const { error: e } = await supabase.storage.from('soportes').upload(ruta, foto, { contentType: foto.type || undefined })
        if (e) throw e
        soporte = ruta
      }
      const { error: e } = await supabase.from('gastos').insert({
        fecha: f.fecha, categoria: f.categoria, tipo: f.tipo,
        proveedor_id: f.proveedorId && f.proveedorId !== OTRO ? f.proveedorId : null,
        beneficiario: f.proveedorId === OTRO ? f.beneficiario.trim() : null,
        gasto_fijo_id: f.gastoFijoId || null, concepto: f.concepto.trim(), valor: f.valor,
        medio_pago: f.medio, soporte_url: soporte, estimado: f.estimado, creado_por: sesion!.user.id,
      })
      if (e) throw e
      toast(`Gasto guardado: ${pesos(f.valor)}`)
      setConfirmar(false); setF({ ...nuevo(), fecha: f.fecha, medio: f.medio }); setFoto(null)
      if (primerDiaMes(f.fecha) !== mes) setMes(primerDiaMes(f.fecha)); else cargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function verSoporte(ruta: string) {
    const { data, error } = await supabase.storage.from('soportes').createSignedUrl(ruta, 300)
    if (error || !data) { toast('No se pudo abrir el soporte'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const total = gastos.reduce((s, g) => s + g.valor, 0)
  const enEfectivo = gastos.filter(g => g.medio_pago === 'Efectivo de caja').reduce((s, g) => s + g.valor, 0)
  const corregidos = new Set(gastos.filter(g => g.es_ajuste && g.ajusta_gasto_id).map(g => g.ajusta_gasto_id))
  const pendienteMedio = (g: Gasto) => g.medio_pago === 'Sin definir' && !g.es_ajuste && !corregidos.has(g.id)
  const sinMedio = gastos.filter(pendienteMedio).length
  const nombreProveedor = (g: Gasto) => g.proveedores?.nombre ?? g.beneficiario ?? '—'

  return (
    <>
      <div className="encabezado">
        <div><p className="antetitulo">Salidas de dinero</p><h1 className="impacto">Gastos</h1></div>
      </div>

      <form className="tarjeta" onSubmit={(e: FormEvent) => { e.preventDefault(); if (!faltan.length) setConfirmar(true) }}>
        <div className="campos">
          <div className="campo">
            <label htmlFor="g-fecha">Fecha</label>
            <input id="g-fecha" type="date" className="entrada" value={f.fecha} max={hoy()} onChange={e => set('fecha', e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="g-fijo">¿Es un gasto fijo?</label>
            <select id="g-fijo" className="entrada" value={f.gastoFijoId} onChange={e => elegirFijo(e.target.value)}>
              <option value="">No, es otro gasto</option>
              {fijos.map(g => <option key={g.id} value={g.id}>{g.nombre} · {pesos(g.valor_estimado)}{g.frecuencia === 'Por día trabajado' ? ' por día' : ''}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="g-cat">Categoría</label>
            <select id="g-cat" className="entrada" value={f.categoria} onChange={e => set('categoria', e.target.value)}>
              <option value="">Elige…</option>
              {CATEGORIAS_GASTO.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo">
            <span className="etiqueta">Tipo</span>
            <div className="segmentos">
              {(['Fijo', 'Variable'] as const).map(t => (
                <button key={t} type="button" aria-pressed={f.tipo === t} onClick={() => set('tipo', t)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="campo">
            <label htmlFor="g-prov">Proveedor o beneficiario</label>
            <select id="g-prov" className="entrada" value={f.proveedorId} onChange={e => set('proveedorId', e.target.value)}>
              <option value="">Elige…</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              <option value={OTRO}>Otro (escribir)</option>
            </select>
          </div>
          {f.proveedorId === OTRO && (
            <div className="campo">
              <label htmlFor="g-benef">¿A quién se le pagó?</label>
              <input id="g-benef" className="entrada" value={f.beneficiario} onChange={e => set('beneficiario', e.target.value)} />
            </div>
          )}
          <div className="campo ancho">
            <label htmlFor="g-concepto">Concepto</label>
            <input id="g-concepto" className="entrada" value={f.concepto} onChange={e => set('concepto', e.target.value)}
              placeholder="Ej. Compra de bolsas" />
          </div>
          <CampoDinero id="g-valor" etiqueta="Valor" valor={f.valor} onCambio={n => set('valor', n)} />
          <div className="campo">
            <label htmlFor="g-medio">Medio de pago</label>
            <select id="g-medio" className="entrada" value={f.medio} onChange={e => set('medio', e.target.value)}>
              {MEDIOS_PAGO.map(m => <option key={m}>{m}</option>)}
            </select>
            <span className="ayuda">{f.medio === 'Efectivo de caja' ? 'Se descuenta del efectivo en caja de ese día.' : 'No afecta la caja del día.'}</span>
          </div>
          <div className="campo">
            <span className="etiqueta">Soporte (opcional)</span>
            <div className="foto">
              <label className="boton contorno chico" style={{ cursor: 'pointer' }}>
                <Icono nombre="camara" tam={18} />{foto ? 'Cambiar foto' : 'Tomar foto'}
                <input type="file" accept="image/*,application/pdf" capture="environment" className="visually-hidden"
                  onChange={e => setFoto(e.target.files?.[0] ?? null)} />
              </label>
              {vistaFoto && <img src={vistaFoto} alt="Vista previa del soporte" />}
              {foto && !vistaFoto && <span className="muted">{foto.name}</span>}
              {foto && <button type="button" className="boton texto chico" onClick={() => setFoto(null)}>Quitar</button>}
            </div>
          </div>
          <label className="casilla">
            <input type="checkbox" checked={f.estimado} onChange={e => set('estimado', e.target.checked)} />
            Valor estimado (todavía no es el real)
          </label>
        </div>
        {faltan.length > 0 && f.concepto && <p className="muted" style={{ marginBottom: 0 }}>Falta: {faltan.join(', ')}.</p>}
        <div className="acciones">
          <button className="boton bloque" disabled={faltan.length > 0}>Revisar y guardar</button>
        </div>
      </form>

      <section className="tarjeta" style={{ marginTop: 24 }}>
        <div className="encabezado" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Gastos del mes</h2>
          <SelectorMes mes={mes} onCambio={setMes} />
        </div>
        <div className="chips" style={{ marginBottom: 12 }}>
          <span className="estado ok">Total {pesos(total)}</span>
          <span className="estado ok">De la caja {pesos(enEfectivo)}</span>
          {sinMedio > 0 && <span className="estado revisar">{sinMedio} sin medio de pago</span>}
        </div>
        {gastos.length === 0 ? <p className="vacio">No hay gastos en {nombreMes(mes).toLowerCase()}.</p> : (
          <ul className="lista">
            {gastos.map(g => (
              <li key={g.id}>
                <div className="principal">
                  <strong>{g.concepto}</strong>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {fechaCorta(g.fecha)} · {g.categoria} · {nombreProveedor(g)} · {g.medio_pago}
                  </span>
                  <div className="chips" style={{ marginTop: 4 }}>
                    {g.estimado && <span className="sticker">Estimado</span>}
                    {g.es_ajuste && <span className="sticker">Ajuste: {g.motivo_ajuste}</span>}
                    {pendienteMedio(g) && <span className="estado revisar">Sin medio de pago</span>}
                    {corregidos.has(g.id) && <span className="estado ok">Corregido</span>}
                  </div>
                </div>
                <div className="derecha">
                  <div className="cifra">{pesos(g.valor)}</div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {g.soporte_url && <button className="boton texto chico" onClick={() => verSoporte(g.soporte_url!)} aria-label="Ver soporte"><Icono nombre="documento" tam={18} /></button>}
                    {!g.es_ajuste && <button className="boton texto chico" onClick={() => setCorrigiendo(g)}>Corregir</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmar && (
        <Dialogo titulo="¿Guardar este gasto?" onCerrar={() => setConfirmar(false)}>
          <p className="muted" style={{ marginTop: 0 }}>Después no se edita: solo se corrige con un ajuste.</p>
          <div className="resumen">
            <div className="fila"><span>Fecha</span><span>{fechaCorta(f.fecha)}</span></div>
            <div className="fila"><span>Concepto</span><span style={{ textAlign: 'right' }}>{f.concepto}</span></div>
            <div className="fila"><span>Categoría · tipo</span><span>{f.categoria} · {f.tipo}</span></div>
            <div className="fila"><span>A quién</span><span>{f.proveedorId === OTRO ? f.beneficiario : proveedores.find(p => p.id === f.proveedorId)?.nombre}</span></div>
            <div className="fila"><span>Medio de pago</span><span>{f.medio}</span></div>
            <div className="fila"><strong>Valor</strong><strong className="cifra">{pesos(f.valor)}</strong></div>
            <div className="fila"><span>Soporte</span><span>{foto ? 'Sí' : 'No'}</span></div>
          </div>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="acciones">
            <button className="boton" onClick={guardar} disabled={guardando}><Icono nombre="ok" />{guardando ? 'Guardando…' : 'Guardar gasto'}</button>
            <button className="boton contorno" onClick={() => setConfirmar(false)}>Volver</button>
          </div>
        </Dialogo>
      )}

      {corrigiendo && <CorregirGasto gasto={corrigiendo} onCerrar={() => setCorrigiendo(null)}
        onGuardado={() => { setCorrigiendo(null); cargar(); toast('Corrección registrada') }} />}
    </>
  )
}

/** Corrección por ajuste: cambia el valor o el medio de pago sin tocar el gasto original. */
function CorregirGasto({ gasto, onCerrar, onGuardado }: { gasto: Gasto; onCerrar: () => void; onGuardado: () => void }) {
  const { sesion } = useSesion()
  const [modo, setModo] = useState<'valor' | 'medio'>(gasto.medio_pago === 'Sin definir' ? 'medio' : 'valor')
  const [texto, setTexto] = useState('')
  const [medio, setMedio] = useState(gasto.medio_pago === 'Sin definir' ? 'Débito bancario' : gasto.medio_pago)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const diferencia = leerPesos(texto)

  const base = {
    fecha: gasto.fecha, categoria: gasto.categoria, tipo: gasto.tipo, proveedor_id: gasto.proveedor_id,
    beneficiario: gasto.beneficiario, gasto_fijo_id: gasto.gasto_fijo_id, concepto: gasto.concepto,
    es_ajuste: true, ajusta_gasto_id: gasto.id, estimado: gasto.estimado, creado_por: sesion!.user.id,
  }

  async function guardar() {
    setGuardando(true); setError(null)
    const m = motivo.trim()
    const filas = modo === 'valor'
      ? [{ ...base, valor: diferencia, medio_pago: gasto.medio_pago, motivo_ajuste: m }]
      : [
          { ...base, valor: -gasto.valor, medio_pago: gasto.medio_pago, motivo_ajuste: `${m} (sale de ${gasto.medio_pago})` },
          { ...base, valor: gasto.valor, medio_pago: medio, motivo_ajuste: `${m} (entra a ${medio})` },
        ]
    const { error } = await supabase.from('gastos').insert(filas)
    setGuardando(false)
    if (error) setError(mensajeError(error)); else onGuardado()
  }

  const valido = motivo.trim().length >= 5 && (modo === 'valor' ? diferencia !== 0 : medio !== gasto.medio_pago)

  return (
    <Dialogo titulo="Corregir gasto" onCerrar={onCerrar}>
      <p style={{ marginTop: 0 }}><strong>{gasto.concepto}</strong> · {pesos(gasto.valor)} · {gasto.medio_pago}</p>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="segmentos">
          <button type="button" aria-pressed={modo === 'medio'} onClick={() => setModo('medio')}>Cambiar medio de pago</button>
          <button type="button" aria-pressed={modo === 'valor'} onClick={() => setModo('valor')}>Corregir el valor</button>
        </div>
        {modo === 'valor' ? (
          <div className="campo">
            <label htmlFor="c-dif">Diferencia (usa − para restar)</label>
            <input id="c-dif" className="entrada dinero" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ej. -20000" />
            <span className="ayuda">Queda en {pesos(gasto.valor + diferencia)}</span>
          </div>
        ) : (
          <div className="campo">
            <label htmlFor="c-medio">Medio de pago correcto</label>
            <select id="c-medio" className="entrada" value={medio} onChange={e => setMedio(e.target.value)}>
              {MEDIOS_PAGO.filter(x => x !== 'Sin definir').map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="c-motivo">Motivo</label>
          <textarea id="c-motivo" className="entrada" value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
      <div className="acciones">
        <button className="boton" disabled={!valido || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Registrar corrección'}</button>
        <button className="boton contorno" onClick={onCerrar}>Cancelar</button>
      </div>
    </Dialogo>
  )
}
