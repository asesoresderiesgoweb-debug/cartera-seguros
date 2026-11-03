import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { backend } from '../lib/backend'
import { Chips } from '../components/ui'
import { exportarExcel } from '../lib/excel'
import type { Aseguradora, Campo, Config, Opcion, Rubro, TipoCampo } from '../lib/types'
import { norm } from '../lib/util'

type Sec = 'general' | 'opciones' | 'rubros' | 'aseguradoras' | 'masiva' | 'usuarios' | 'datos' | 'biblioteca'

function General() {
  const s = useStore()
  const [c, setC] = useState<Config>(s.config)
  const [ok, setOk] = useState(false)
  const num = (k: 'dias_aviso' | 'dias_historico' | 'dias_cuota', label: string, ayuda: string) => (
    <label>{label}
      <input type="number" min={0} value={c[k]} onChange={(e) => { setC({ ...c, [k]: Number(e.target.value) }); setOk(false) }} />
      <span className="ayuda">{ayuda}</span>
    </label>
  )
  return (
    <div className="form">
      {num('dias_aviso', 'Días de aviso antes del vencimiento', 'Cuántos días antes una póliza pasa a POR VENCER (amarillo).')}
      {num('dias_historico', 'Días para pasar al Histórico', 'Vencidas sin renovar hace más de estos días pasan solas al Histórico. 0 = nunca.')}
      {num('dias_cuota', 'Días de aviso de cuota', 'Avisa cuando el próximo vencimiento de cuota está a estos días o menos.')}
      <div className="fila-botones"><button onClick={async () => { await s.guardarConfig(c); setOk(true) }}>Guardar</button>{ok && <span className="ok">Guardado ✓</span>}</div>
    </div>
  )
}

function ListaOpciones({ titulo, ayuda, flag, flagLabel, lista, onChange }:
  { titulo: string; ayuda: string; flag: keyof Opcion; flagLabel: string; lista: Opcion[]; onChange: (l: Opcion[]) => void }) {
  return (
    <div className="tarjeta">
      <h3>{titulo}</h3>
      <p className="ayuda">{ayuda}</p>
      {lista.map((o, i) => (
        <div key={i} className="opcion-fila">
          <input value={o.v} onChange={(e) => onChange(lista.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
          <label className="check"><input type="checkbox" checked={!!o[flag]}
            onChange={(e) => onChange(lista.map((x, j) => (j === i ? { ...x, [flag]: e.target.checked || undefined } : x)))} />{flagLabel}</label>
          <button className="icono" aria-label="Quitar" onClick={() => onChange(lista.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="mini" onClick={() => onChange([...lista, { v: '' }])}>＋ Agregar opción</button>
    </div>
  )
}

function Opciones() {
  const s = useStore()
  const [c, setC] = useState<Config>(s.config)
  const [ok, setOk] = useState(false)
  const upd = (k: 'gestion' | 'estado_cuota' | 'renovacion') => (l: Opcion[]) => { setC({ ...c, [k]: l }); setOk(false) }
  return (
    <div>
      <p className="ayuda">Cambiar el nombre de una opción no cambia las pólizas que ya la tienen cargada.</p>
      <ListaOpciones titulo="Gestión del vencimiento" ayuda="Las marcadas como «cierra» dejan de avisar." flag="cierra" flagLabel="cierra" lista={c.gestion} onChange={upd('gestion')} />
      <ListaOpciones titulo="Estado de cuota" ayuda="Las marcadas como «alerta» aparecen en Cuotas a revisar." flag="alerta" flagLabel="alerta" lista={c.estado_cuota} onChange={upd('estado_cuota')} />
      <ListaOpciones titulo="Tipo de renovación" ayuda="Las marcadas como «requiere acción» se destacan en los avisos." flag="accion" flagLabel="requiere acción" lista={c.renovacion} onChange={upd('renovacion')} />
      <div className="fila-botones"><button onClick={async () => {
        const limpio = { ...c, gestion: c.gestion.filter((o) => o.v.trim()), estado_cuota: c.estado_cuota.filter((o) => o.v.trim()), renovacion: c.renovacion.filter((o) => o.v.trim()) }
        await s.guardarConfig(limpio); setC(limpio); setOk(true)
      }}>Guardar opciones</button>{ok && <span className="ok">Guardado ✓</span>}</div>
    </div>
  )
}

const TIPOS: [TipoCampo, string][] = [['texto', 'Texto'], ['numero', 'Número'], ['fecha', 'Fecha'], ['opciones', 'Lista de opciones'], ['largo', 'Texto largo']]

function RubroEditor({ r, onClose }: { r: Partial<Rubro>; onClose: () => void }) {
  const s = useStore()
  const [x, setX] = useState<Partial<Rubro>>({ campos: [], activo: true, usa_items: false, orden: s.rubros.length + 1, ...r })
  const setCampo = (i: number, c: Partial<Campo>) => setX({ ...x, campos: x.campos!.map((v, j) => (j === i ? { ...v, ...c } : v)) })
  return (
    <div className="tarjeta form">
      <div className="dos">
        <label>Nombre<input value={x.nombre ?? ''} onChange={(e) => setX({ ...x, nombre: e.target.value })} /></label>
        <label>Orden<input type="number" value={x.orden ?? 0} onChange={(e) => setX({ ...x, orden: Number(e.target.value) })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={!!x.activo} onChange={(e) => setX({ ...x, activo: e.target.checked })} />Activo (se muestra en la cartera)</label>
      <label className="check"><input type="checkbox" checked={!!x.usa_items} onChange={(e) => setX({ ...x, usa_items: e.target.checked })} />Lleva vehículos (patente, modelo, año)</label>
      <h4>Campos propios del rubro</h4>
      {x.campos!.map((c, i) => (
        <div key={i} className="campo-fila">
          <input placeholder="Nombre del campo" value={c.label} onChange={(e) => setCampo(i, { label: e.target.value, k: c.k || norm(e.target.value).replace(/[^a-z0-9]+/g, '_') })} />
          <select value={c.tipo} onChange={(e) => setCampo(i, { tipo: e.target.value as TipoCampo })}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          {c.tipo === 'opciones' && <input placeholder="Opciones separadas por coma" value={(c.opciones ?? []).join(', ')}
            onChange={(e) => setCampo(i, { opciones: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />}
          <button className="icono" aria-label="Quitar campo" onClick={() => setX({ ...x, campos: x.campos!.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button className="mini" onClick={() => setX({ ...x, campos: [...x.campos!, { k: '', label: '', tipo: 'texto' }] })}>＋ Agregar campo</button>
      <div className="fila-botones">
        <button onClick={async () => {
          if (!x.nombre?.trim()) return
          await s.guardar('rubros', { ...x, nombre: x.nombre.trim(), campos: x.campos!.filter((c) => c.label.trim() && c.k) } as Rubro)
          onClose()
        }}>Guardar rubro</button>
        <button className="secundario" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

function Rubros() {
  const s = useStore()
  const [edit, setEdit] = useState<Partial<Rubro> | null>(null)
  if (edit) return <RubroEditor r={edit} onClose={() => setEdit(null)} />
  return (
    <div>
      <div className="lista">
        {[...s.rubros].sort((a, b) => a.orden - b.orden).map((r) => (
          <button key={r.id} className="cliente-fila" onClick={() => setEdit(r)}>
            <div><div className="pf-nombre">{r.nombre}{!r.activo && ' (inactivo)'}</div>
              <div className="pf-sub">{r.campos.map((c) => c.label).join(', ') || 'Sin campos propios'}{r.usa_items ? ' · vehículos' : ''}</div></div>
            <span>Editar</span>
          </button>
        ))}
      </div>
      <button className="mini" onClick={() => setEdit({})}>＋ Nuevo rubro</button>
    </div>
  )
}

function Aseguradoras() {
  const s = useStore()
  const [edit, setEdit] = useState<Partial<Aseguradora> | null>(null)
  const uso = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of s.polizas) if (p.estado === 'activa' && p.aseguradora_id) m.set(p.aseguradora_id, (m.get(p.aseguradora_id) ?? 0) + 1)
    return m
  }, [s.polizas])
  if (edit) {
    return (
      <div className="tarjeta form">
        <label>Nombre<input value={edit.nombre ?? ''} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></label>
        <label>Otros nombres con que aparece (separados por coma)
          <input value={(edit.variantes ?? []).join(', ')} onChange={(e) => setEdit({ ...edit, variantes: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} /></label>
        <div className="dos">
          <label>Web<input value={edit.web ?? ''} onChange={(e) => setEdit({ ...edit, web: e.target.value || null })} /></label>
          <label>Link al portal<input value={edit.portal ?? ''} onChange={(e) => setEdit({ ...edit, portal: e.target.value || null })} /></label>
        </div>
        <p className="ayuda">No guardes usuarios ni contraseñas acá: usá un gestor de contraseñas (Bitwarden o el de Google).</p>
        <label className="check"><input type="checkbox" checked={edit.activa ?? true} onChange={(e) => setEdit({ ...edit, activa: e.target.checked })} />Activa (aparece al cargar pólizas)</label>
        {!!edit.contactos?.length && (
          <details><summary>Contactos por trámite ({edit.contactos.length})</summary>
            <ul className="items">{edit.contactos.map((c, i) => <li key={i}><strong>{c.tramite}:</strong> {c.dato} {c.telefono}</li>)}</ul>
          </details>
        )}
        <div className="fila-botones">
          <button onClick={async () => { if (!edit.nombre?.trim()) return; await s.guardar('aseguradoras', { variantes: [], contactos: [], activa: true, ...edit, nombre: edit.nombre.trim() } as Aseguradora); setEdit(null) }}>Guardar</button>
          <button className="secundario" onClick={() => setEdit(null)}>Cancelar</button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <button className="mini" onClick={() => setEdit({ activa: true })}>＋ Nueva aseguradora</button>
      <div className="lista">
        {[...s.aseguradoras].sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre)).map((a) => (
          <button key={a.id} className="cliente-fila" onClick={() => setEdit(a)}>
            <div><div className="pf-nombre">{a.nombre}{!a.activa && ' (inactiva)'}</div>
              <div className="pf-sub">{a.variantes.length ? `También: ${a.variantes.slice(0, 5).join(', ')}${a.variantes.length > 5 ? '…' : ''}` : ''}{a.contactos.length ? ` · ${a.contactos.length} contactos` : ''}</div></div>
            <span className="sutil">{uso.get(a.id) ?? 0} activas</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Masiva() {
  const s = useStore()
  const [aseg, setAseg] = useState(0)
  const [rubro, setRubro] = useState(0)
  const [valor, setValor] = useState(s.config.renovacion[0]?.v ?? '')
  const [pisar, setPisar] = useState(false)
  const [prog, setProg] = useState<string | null>(null)
  const afectadas = s.polizas.filter((p) => p.estado === 'activa' && (!aseg || p.aseguradora_id === aseg) && (!rubro || p.rubro_id === rubro) && (pisar || !p.renovacion))
  return (
    <div className="tarjeta form">
      <p className="ayuda">Para marcar de una vez el tipo de renovación de muchas pólizas. Por ejemplo: «todas las de Cooperación son por cupones».
        Si no sabés cuál es: la que se debita sola (tarjeta o CBU) es Automática; la que el cliente paga con cupón o factura cada período es Cupones; la que hay que pedirle a la compañía, Manual.</p>
      <div className="dos">
        <label>Compañía<select value={aseg} onChange={(e) => setAseg(Number(e.target.value))}><option value={0}>Todas</option>{s.aseguradoras.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
        <label>Rubro<select value={rubro} onChange={(e) => setRubro(Number(e.target.value))}><option value={0}>Todos</option>{s.rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
      </div>
      <label>Marcar como<select value={valor} onChange={(e) => setValor(e.target.value)}>{s.config.renovacion.map((o) => <option key={o.v}>{o.v}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={pisar} onChange={(e) => setPisar(e.target.checked)} />Cambiar también las que ya tienen un tipo cargado</label>
      <div className="fila-botones">
        <button disabled={!afectadas.length || !!prog} onClick={async () => {
          if (!confirm(`¿Marcar ${afectadas.length} pólizas como «${valor}»?`)) return
          for (let i = 0; i < afectadas.length; i++) {
            setProg(`${i + 1} / ${afectadas.length}`)
            await s.guardarPoliza({ ...afectadas[i], renovacion: valor })
          }
          setProg(null)
        }}>Aplicar a {afectadas.length} pólizas</button>
        {prog && <span className="sutil">Guardando {prog}…</span>}
      </div>
    </div>
  )
}

function Usuarios() {
  const s = useStore()
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<'usuario' | 'admin'>('usuario')
  return (
    <div className="tarjeta form">
      <p className="ayuda">Solo estos mails pueden ver la cartera. Para que alguien entre hay que (1) agregarlo acá y (2) crearle la contraseña en Supabase → Authentication → Add user (ver la guía).</p>
      <ul className="items">
        {s.usuarios.map((u) => (
          <li key={u.email} className="opcion-fila">
            <span>{u.email} <span className="sutil">({u.rol})</span></span>
            {s.esAdmin && u.email !== s.email && <button className="icono" aria-label="Quitar" onClick={() => confirm(`¿Quitar a ${u.email}?`) && s.borrar('usuarios', u.email)}>✕</button>}
          </li>
        ))}
      </ul>
      {s.esAdmin ? (
        <div className="opcion-fila">
          <input type="email" placeholder="mail@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={rol} onChange={(e) => setRol(e.target.value as 'usuario' | 'admin')}><option value="usuario">usuario</option><option value="admin">admin</option></select>
          <button className="mini" onClick={async () => { if (!email.includes('@')) return; await s.guardar('usuarios', { email: email.trim().toLowerCase(), nombre: null, rol } as never); setEmail('') }}>Agregar</button>
        </div>
      ) : <p className="sutil">Solo una administradora puede agregar o quitar usuarios.</p>}
    </div>
  )
}

function CargaInicial() {
  const s = useStore()
  const [json, setJson] = useState<Record<string, unknown[]> | null>(null)
  const [conf, setConf] = useState('')
  const [estado, setEstado] = useState<string | null>(null)
  const hayDatos = s.polizas.length > 0
  async function cargar() {
    if (!json) return
    try {
      if (hayDatos) { setEstado('Vaciando la cartera actual…'); await backend.rpc('vaciar_cartera') }
      for (const t of ['aseguradoras', 'rubros', 'clientes', 'polizas', 'poliza_items', 'biblioteca'] as const) {
        setEstado(`Cargando ${t} (${json[t]?.length ?? 0})…`)
        await backend.insertarLote(t, (json[t] ?? []) as object[])
      }
      await backend.rpc('reiniciar_secuencias')
      setEstado('Listo ✓ Recargando…')
      await s.recargar()
      setJson(null)
      setEstado('Carga completa ✓')
    } catch (e) { setEstado(`Error: ${(e as Error).message}`) }
  }
  return (
    <div className="tarjeta form">
      <h3>Carga inicial</h3>
      <p className="ayuda">Subí el archivo <code>carga_inicial.json</code> que genera el importador a partir de los Excel.{hayDatos && ' Ojo: reemplaza TODA la cartera actual.'}</p>
      <input type="file" accept=".json,application/json" onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        try { setJson(JSON.parse(await f.text())); setEstado(null) } catch { setEstado('El archivo no es válido') }
      }} />
      {json && (
        <>
          <p>Contiene: {(['aseguradoras', 'clientes', 'polizas', 'poliza_items'] as const).map((k) => `${json[k]?.length ?? 0} ${k.replace('_', ' ')}`).join(' · ')}</p>
          {hayDatos && <label>Escribí BORRAR para confirmar<input value={conf} onChange={(e) => setConf(e.target.value)} /></label>}
          <button className="peligro" disabled={hayDatos && conf !== 'BORRAR'} onClick={cargar}>Cargar</button>
        </>
      )}
      {estado && <p className="sutil">{estado}</p>}
    </div>
  )
}

function Biblioteca() {
  const s = useStore()
  const [t, setT] = useState('')
  const [u, setU] = useState('')
  return (
    <div className="tarjeta">
      <ul className="items">
        {s.biblioteca.map((b) => <li key={b.id}>{b.url ? <a href={b.url} target="_blank" rel="noreferrer">{b.titulo} ↗</a> : b.titulo}</li>)}
      </ul>
      <div className="opcion-fila">
        <input placeholder="Título" value={t} onChange={(e) => setT(e.target.value)} />
        <input placeholder="Link (opcional)" value={u} onChange={(e) => setU(e.target.value)} />
        <button className="mini" onClick={async () => { if (!t.trim()) return; await s.guardar('biblioteca', { titulo: t.trim(), url: u.trim() || null, categoria: 'ART' } as never); setT(''); setU('') }}>Agregar</button>
      </div>
    </div>
  )
}

export default function Configuracion() {
  const s = useStore()
  const [sec, setSec] = useState<Sec>('general')
  const [exp, setExp] = useState(false)
  const secciones: { v: Sec; label: string }[] = [
    { v: 'general', label: 'Avisos' }, { v: 'opciones', label: 'Estados' }, { v: 'rubros', label: 'Rubros' },
    { v: 'aseguradoras', label: 'Aseguradoras' }, { v: 'masiva', label: 'Renovación masiva' },
    { v: 'usuarios', label: 'Usuarios' }, { v: 'datos', label: 'Datos' }, { v: 'biblioteca', label: 'Biblioteca' },
  ]
  return (
    <div>
      <div className="titulo-fila">
        <h1>Ajustes</h1>
        <span className="sutil">{s.email} · <button className="enlace" onClick={() => backend.salir()}>Salir</button></span>
      </div>
      <Chips<Sec> valor={sec} onChange={setSec} opciones={secciones} />
      {sec === 'general' && <General />}
      {sec === 'opciones' && <Opciones />}
      {sec === 'rubros' && <Rubros />}
      {sec === 'aseguradoras' && <Aseguradoras />}
      {sec === 'masiva' && <Masiva />}
      {sec === 'usuarios' && <Usuarios />}
      {sec === 'biblioteca' && <Biblioteca />}
      {sec === 'datos' && (
        <div>
          <div className="tarjeta">
            <h3>Exportar a Excel</h3>
            <p className="ayuda">Descarga toda la cartera: una hoja por rubro, el Histórico y los clientes. Sirve también como copia de seguridad.</p>
            <button disabled={exp} onClick={async () => { setExp(true); try { await exportarExcel(s) } finally { setExp(false) } }}>{exp ? 'Generando…' : 'Descargar Excel'}</button>
          </div>
          {s.esAdmin && <CargaInicial />}
        </div>
      )}
    </div>
  )
}
