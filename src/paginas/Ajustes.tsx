import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIAS_GASTO, MEDIOS_PAGO, type GastoFijo, type Perfil, type Proveedor } from '../lib/tipos'
import { fechaLarga, hoy, leerCantidad, mensajeError, nombreMes, pesos, primerDiaMes } from '../lib/formato'
import { Aviso, CampoDinero, Dialogo, useToast } from '../componentes/ui'
import { useSesion } from '../componentes/Sesion'
import { Icono } from '../componentes/Icono'

export function Ajustes() {
  return (
    <>
      <div className="encabezado">
        <div><p className="antetitulo">Configuración</p><h1 className="impacto">Ajustes</h1></div>
      </div>
      <div className="rejilla">
        <Margen />
        <GastosFijos />
        <Proveedores />
        <Usuarios />
        <Festivos />
      </div>
    </>
  )
}

function Margen() {
  const toast = useToast()
  const mes = primerDiaMes(hoy())
  const [texto, setTexto] = useState('')
  const [notas, setNotas] = useState('')
  const [existe, setExiste] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('meses').select('margen_bruto_estimado, notas').eq('mes', mes).maybeSingle().then(({ data }) => {
      setExiste(!!data)
      setTexto(String(Math.round(Number(data?.margen_bruto_estimado ?? 0.43) * 1000) / 10).replace('.', ','))
      setNotas(data?.notas ?? '')
    })
  }, [mes])

  const valor = leerCantidad(texto)
  const valido = valor != null && valor > 0 && valor < 100

  async function guardar() {
    setError(null)
    const fila = { mes, margen_bruto_estimado: Math.round(valor! * 10) / 1000, notas: notas.trim() || null }
    const { error } = existe
      ? await supabase.from('meses').update(fila).eq('mes', mes)
      : await supabase.from('meses').insert(fila)
    if (error) setError(mensajeError(error)); else { setExiste(true); toast('Margen guardado') }
  }

  return (
    <section className="tarjeta suave">
      <h2>Margen estimado · {nombreMes(mes)}</h2>
      <p className="muted" style={{ marginTop: -6 }}>Margen bruto sobre el precio de venta. Un markup de 70–80 % sobre el costo equivale a ~43 %. Se usa para el punto de equilibrio.</p>
      <div className="campos">
        <div className="campo">
          <label htmlFor="margen">Margen (%)</label>
          <input id="margen" className="entrada" inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)} aria-invalid={!valido} />
        </div>
        <div className="campo">
          <label htmlFor="notas-mes">Notas del mes</label>
          <input id="notas-mes" className="entrada" value={notas} onChange={e => setNotas(e.target.value)} />
        </div>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="acciones"><button className="boton" disabled={!valido} onClick={guardar}>Guardar margen</button></div>
    </section>
  )
}

function GastosFijos() {
  const [fijos, setFijos] = useState<GastoFijo[]>([])
  const [editando, setEditando] = useState<GastoFijo | 'nuevo' | null>(null)
  const cargar = useCallback(() => {
    supabase.from('gastos_fijos').select('*').order('activo', { ascending: false }).order('valor_estimado', { ascending: false })
      .then(({ data }) => setFijos((data ?? []) as GastoFijo[]))
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const mensual = fijos.filter(f => f.activo && f.frecuencia === 'Mensual').reduce((s, f) => s + f.valor_estimado, 0)

  return (
    <section className="tarjeta">
      <div className="encabezado" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Gastos fijos</h2>
        <button className="boton contorno chico" onClick={() => setEditando('nuevo')}><Icono nombre="mas" tam={18} />Agregar</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Mensuales activos: <strong className="cifra" style={{ color: 'var(--gris)' }}>{pesos(mensual)}</strong>. La nómina por día se multiplica por los días hábiles del mes.</p>
      <ul className="lista">
        {fijos.map(f => (
          <li key={f.id} style={{ opacity: f.activo ? 1 : 0.55 }}>
            <span className="principal"><strong>{f.nombre}</strong>
              <span className="muted" style={{ fontSize: 13 }}>{f.categoria} · {f.frecuencia}{f.dia_pago ? ` · se paga el ${f.dia_pago}` : ''}{f.valor_variable ? ' · valor variable' : ''}{!f.activo ? ' · inactivo' : ''}</span></span>
            <span className="cifra">{pesos(f.valor_estimado)}{f.frecuencia === 'Por día trabajado' ? ' /día' : ''}</span>
            <button className="boton texto chico" onClick={() => setEditando(f)}>Editar</button>
          </li>
        ))}
      </ul>
      {editando && <EditarFijo fijo={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />}
    </section>
  )
}

function EditarFijo({ fijo, onCerrar, onGuardado }: { fijo: GastoFijo | null; onCerrar: () => void; onGuardado: () => void }) {
  const toast = useToast()
  const [nombre, setNombre] = useState(fijo?.nombre ?? '')
  const [categoria, setCategoria] = useState(fijo?.categoria ?? 'Servicios')
  const [valor, setValor] = useState(fijo?.valor_estimado ?? 0)
  const [frecuencia, setFrecuencia] = useState<GastoFijo['frecuencia']>(fijo?.frecuencia ?? 'Mensual')
  const [dia, setDia] = useState(fijo?.dia_pago ? String(fijo.dia_pago) : '')
  const [variable, setVariable] = useState(fijo?.valor_variable ?? false)
  const [activo, setActivo] = useState(fijo?.activo ?? true)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    const d = dia ? parseInt(dia, 10) : null
    const fila = { nombre: nombre.trim(), categoria, valor_estimado: valor, frecuencia, dia_pago: d && d >= 1 && d <= 31 ? d : null, valor_variable: variable, activo }
    const { error } = fijo ? await supabase.from('gastos_fijos').update(fila).eq('id', fijo.id) : await supabase.from('gastos_fijos').insert(fila)
    if (error) setError(mensajeError(error)); else { toast('Gasto fijo guardado'); onGuardado() }
  }

  return (
    <Dialogo titulo={fijo ? `Editar ${fijo.nombre}` : 'Nuevo gasto fijo'} onCerrar={onCerrar}>
      <div className="campos">
        <div className="campo ancho"><label htmlFor="f-nombre">Nombre</label>
          <input id="f-nombre" className="entrada" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
        <div className="campo"><label htmlFor="f-cat">Categoría</label>
          <select id="f-cat" className="entrada" value={categoria} onChange={e => setCategoria(e.target.value)}>
            {CATEGORIAS_GASTO.map(c => <option key={c}>{c}</option>)}
          </select></div>
        <CampoDinero id="f-valor" etiqueta={frecuencia === 'Mensual' ? 'Valor estimado al mes' : 'Valor por día trabajado'} valor={valor} onCambio={setValor} />
        <div className="campo"><span className="etiqueta">Frecuencia</span>
          <div className="segmentos">
            {(['Mensual', 'Por día trabajado'] as const).map(x => <button key={x} type="button" aria-pressed={frecuencia === x} onClick={() => setFrecuencia(x)}>{x}</button>)}
          </div></div>
        <div className="campo"><label htmlFor="f-dia">Día de pago (opcional)</label>
          <input id="f-dia" className="entrada" inputMode="numeric" value={dia} onChange={e => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} /></div>
        <label className="casilla"><input type="checkbox" checked={variable} onChange={e => setVariable(e.target.checked)} />El valor cambia cada mes</label>
        <label className="casilla"><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />Activo</label>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="acciones">
        <button className="boton" disabled={!nombre.trim() || valor <= 0} onClick={guardar}>Guardar</button>
        <button className="boton contorno" onClick={onCerrar}>Cancelar</button>
      </div>
    </Dialogo>
  )
}

function Proveedores() {
  const [provs, setProvs] = useState<Proveedor[]>([])
  const [editando, setEditando] = useState<Proveedor | 'nuevo' | null>(null)
  const cargar = useCallback(() => {
    supabase.from('proveedores').select('*').order('activo', { ascending: false }).order('nombre').then(({ data }) => setProvs((data ?? []) as Proveedor[]))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  return (
    <section className="tarjeta">
      <div className="encabezado" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Proveedores</h2>
        <button className="boton contorno chico" onClick={() => setEditando('nuevo')}><Icono nombre="mas" tam={18} />Agregar</button>
      </div>
      <ul className="lista">
        {provs.map(p => (
          <li key={p.id} style={{ opacity: p.activo ? 1 : 0.55 }}>
            <span className="principal"><strong>{p.nombre}</strong>
              <span className="muted" style={{ fontSize: 13 }}>{[p.que_vende, p.medio_pago_habitual, p.contacto].filter(Boolean).join(' · ') || 'Sin detalles'}</span></span>
            <button className="boton texto chico" onClick={() => setEditando(p)}>Editar</button>
          </li>
        ))}
      </ul>
      {editando && <EditarProveedor prov={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />}
    </section>
  )
}

function EditarProveedor({ prov, onCerrar, onGuardado }: { prov: Proveedor | null; onCerrar: () => void; onGuardado: () => void }) {
  const toast = useToast()
  const [nombre, setNombre] = useState(prov?.nombre ?? '')
  const [vende, setVende] = useState(prov?.que_vende ?? '')
  const [medio, setMedio] = useState(prov?.medio_pago_habitual ?? 'Débito bancario')
  const [contacto, setContacto] = useState(prov?.contacto ?? '')
  const [activo, setActivo] = useState(prov?.activo ?? true)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    const fila = { nombre: nombre.trim(), que_vende: vende.trim() || null, medio_pago_habitual: medio, contacto: contacto.trim() || null, activo }
    const { error } = prov ? await supabase.from('proveedores').update(fila).eq('id', prov.id) : await supabase.from('proveedores').insert(fila)
    if (error) setError(mensajeError(error)); else { toast('Proveedor guardado'); onGuardado() }
  }

  return (
    <Dialogo titulo={prov ? `Editar ${prov.nombre}` : 'Nuevo proveedor'} onCerrar={onCerrar}>
      <div className="campos">
        <div className="campo ancho"><label htmlFor="p-nombre">Nombre</label>
          <input id="p-nombre" className="entrada" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
        <div className="campo ancho"><label htmlFor="p-vende">Qué vende</label>
          <input id="p-vende" className="entrada" value={vende} onChange={e => setVende(e.target.value)} /></div>
        <div className="campo"><label htmlFor="p-medio">Medio de pago habitual</label>
          <select id="p-medio" className="entrada" value={medio} onChange={e => setMedio(e.target.value)}>
            {MEDIOS_PAGO.filter(m => m !== 'Sin definir').map(m => <option key={m}>{m}</option>)}
          </select></div>
        <div className="campo"><label htmlFor="p-contacto">Contacto</label>
          <input id="p-contacto" className="entrada" value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Teléfono o correo" /></div>
        <label className="casilla"><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />Activo</label>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="acciones">
        <button className="boton" disabled={!nombre.trim()} onClick={guardar}>Guardar</button>
        <button className="boton contorno" onClick={onCerrar}>Cancelar</button>
      </div>
    </Dialogo>
  )
}

const ROLES: { valor: Perfil['rol']; texto: string; ayuda: string }[] = [
  { valor: 'admin', texto: 'Dueña', ayuda: 'Ve y registra todo' },
  { valor: 'operador', texto: 'Cierres e inventario', ayuda: 'No ve gastos, panel ni ajustes' },
  { valor: 'pendiente', texto: 'Sin acceso', ayuda: 'Puede entrar pero no ve nada' },
]

function Usuarios() {
  const { perfil: yo } = useSesion()
  const toast = useToast()
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(() => {
    supabase.from('perfiles').select('id, nombre, rol, activo').order('creado_en').then(({ data }) => setPerfiles((data ?? []) as Perfil[]))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function cambiar(p: Perfil, cambios: Partial<Perfil>) {
    setError(null)
    const { error } = await supabase.from('perfiles').update(cambios).eq('id', p.id)
    if (error) setError(mensajeError(error)); else { toast(`${p.nombre} actualizado`); cargar() }
  }

  return (
    <section className="tarjeta">
      <h2>Usuarios</h2>
      <ul className="lista">
        {perfiles.map(p => (
          <li key={p.id} style={{ flexWrap: 'wrap' }}>
            <span className="principal"><strong>{p.nombre}{p.id === yo?.id ? ' (tú)' : ''}</strong>
              <span className="muted" style={{ fontSize: 13 }}>{ROLES.find(r => r.valor === p.rol)?.ayuda}{!p.activo ? ' · desactivado' : ''}</span></span>
            {p.id === yo?.id ? <span className="estado ok">Dueña</span> : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select className="entrada" style={{ minHeight: 44, fontSize: 15, width: 'auto' }} aria-label={`Rol de ${p.nombre}`}
                  value={p.rol} onChange={e => cambiar(p, { rol: e.target.value as Perfil['rol'] })}>
                  {ROLES.map(r => <option key={r.valor} value={r.valor}>{r.texto}</option>)}
                </select>
                <button className="boton contorno chico" onClick={() => cambiar(p, { activo: !p.activo })}>{p.activo ? 'Desactivar' : 'Activar'}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Aviso tipo="info">
        Para agregar a alguien: en Supabase, Authentication → Users → Add user, con su correo y “Auto Confirm User”. Luego esa persona entra a la app con “Crear o recuperar contraseña”, y aquí le das el rol. Los usuarios no se borran: se desactivan.
      </Aviso>
    </section>
  )
}

function Festivos() {
  const toast = useToast()
  const [lista, setLista] = useState<{ fecha: string; nombre: string }[]>([])
  const [fecha, setFecha] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(() => {
    supabase.from('festivos').select('fecha, nombre').gte('fecha', hoy()).order('fecha').limit(8).then(({ data }) => setLista(data ?? []))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function agregar() {
    setError(null)
    const { error } = await supabase.from('festivos').insert({ fecha, nombre: nombre.trim() })
    if (error) setError(error.message.includes('duplicate') ? 'Esa fecha ya está como festivo.' : mensajeError(error))
    else { toast('Festivo agregado'); setFecha(''); setNombre(''); cargar() }
  }

  return (
    <section className="tarjeta">
      <h2>Próximos festivos</h2>
      <p className="muted" style={{ marginTop: -6 }}>No cuentan como días hábiles para la nómina estimada ni para el punto de equilibrio.</p>
      <ul className="lista">
        {lista.map(f => <li key={f.fecha}><span className="principal"><strong>{fechaLarga(f.fecha)}</strong><span className="muted" style={{ fontSize: 13 }}>{f.nombre}</span></span></li>)}
      </ul>
      <div className="campos" style={{ marginTop: 12 }}>
        <div className="campo"><label htmlFor="fe-fecha">Fecha</label><input id="fe-fecha" type="date" className="entrada" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div className="campo"><label htmlFor="fe-nombre">Nombre</label><input id="fe-nombre" className="entrada" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="acciones"><button className="boton contorno" disabled={!fecha || !nombre.trim()} onClick={agregar}>Agregar festivo</button></div>
    </section>
  )
}
